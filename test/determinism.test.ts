import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { vendoredBlobPath } from '../src/cache/paths.js';
import { loadCatalog } from '../src/catalog/load.js';
import { fromRoot } from '../src/catalog/paths.js';
import { generateFixture, sha256 } from '../src/generators/fixtures.js';
import { inspectLegacyManifest } from '../src/migration/purejsimage.js';
import { applyMutations, type MutationOperation } from '../src/mutations/apply.js';
import { formatInventoryTable, generatedFiles, renderReadme } from '../src/reporting/index.js';

interface GeneratedRecipe {
  kind: 'generated';
  caseId: string;
  generator: string;
  parameters: Record<string, unknown>;
}

interface MutationRecipe {
  kind: 'mutation';
  caseId: string;
  target: string;
  parentSha256: string;
  operations: MutationOperation[];
}

async function recipes(directory: string): Promise<unknown[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(
    names.map(async (name) => JSON.parse(await readFile(join(directory, name), 'utf8')) as unknown),
  );
}

describe('deterministic artifacts', () => {
  it('regenerates every generated fixture byte-for-byte', async () => {
    const catalog = await loadCatalog();
    for (const value of (await recipes(fromRoot('recipes/generated'))) as GeneratedRecipe[]) {
      const corpusCase = catalog.cases.find((candidate) => candidate.id === value.caseId);
      expect(corpusCase, value.caseId).toBeDefined();
      const files = generateFixture(value.generator, value.parameters);
      for (const file of files) {
        const asset = corpusCase?.assets.find((candidate) => candidate.path === file.path);
        expect(asset, `${value.caseId}/${file.path}`).toBeDefined();
        expect(file.bytes.byteLength).toBe(asset?.bytes);
        expect(sha256(file.bytes)).toBe(asset?.sha256);
      }
    }
  });

  it('replays every mutation recipe deterministically', async () => {
    const catalog = await loadCatalog();
    for (const value of (await recipes(fromRoot('recipes/mutations'))) as MutationRecipe[]) {
      const parent = await readFile(vendoredBlobPath(value.parentSha256));
      const output = applyMutations(parent, value.operations);
      const corpusCase = catalog.cases.find((candidate) => candidate.id === value.caseId);
      const outputAsset = corpusCase?.assets.find((asset) => asset.path === value.target);
      if (outputAsset) {
        expect(output.byteLength).toBe(outputAsset.bytes);
        expect(sha256(output)).toBe(outputAsset.sha256);
      } else {
        expect(output.byteLength).toBe(0);
      }
    }
  });

  it('builds indexes deterministically', async () => {
    const catalog = await loadCatalog();
    expect(generatedFiles(catalog)).toEqual(generatedFiles(catalog));
  });

  it('renders every catalog format and live file count into the README template', async () => {
    const catalog = await loadCatalog();
    const template = await readFile(fromRoot('README.template.md'), 'utf8');
    const table = formatInventoryTable(catalog);
    const readme = renderReadme(template, catalog);
    expect(readme).not.toContain('{{FORMAT_TABLE}}');
    expect(readme).not.toContain('{{CASE_COUNT}}');
    expect(readme).not.toContain('{{FORMAT_COUNT}}');
    expect(readme).toContain(`test_cases-${catalog.cases.length}-6b57e8`);
    expect(readme).toContain(`formats-${catalog.formats.length}-3f7f12`);
    expect(readme).toContain(table);
    for (const format of catalog.formats) expect(table).toContain(`**\`${format}\`**`);
    expect(table).toContain(
      `| **Total: ${catalog.formats.length} formats** | Logical files, including shared references | **${catalog.cases.length}** |`,
    );
  });

  it('reports valid, duplicate, incomplete, and unlicensed legacy manifest entries', () => {
    const first = {
      id: 'first',
      file: 'first.png',
      url: 'https://example.com/first.png',
      sourcePage: 'https://example.com/first',
      author: 'Example Author',
      license: 'CC0-1.0',
      expected: { sha256: 'a'.repeat(64) },
    };
    const manifest = {
      sources: [
        first,
        { ...first, id: 'duplicate', file: 'duplicate.png' },
        {
          ...first,
          id: 'missing-license',
          file: 'missing-license.png',
          license: '',
          expected: { sha256: 'b'.repeat(64) },
        },
        {
          ...first,
          id: 'missing-hash',
          file: 'missing-hash.png',
          expected: {},
        },
        { id: 'broken' },
      ],
    };
    expect(inspectLegacyManifest(manifest)).toEqual({
      total: 5,
      valid: 4,
      deduplicated: 1,
      errors: [
        {
          index: 4,
          id: 'broken',
          message: 'Missing a required legacy field or expected object.',
        },
      ],
      missingLicenses: ['missing-license'],
      missingHashes: ['missing-hash'],
    });
  });
});
