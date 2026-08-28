import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { vendoredBlobPath } from '../src/cache/paths.js';
import { loadCatalog } from '../src/catalog/load.js';
import { fromRoot } from '../src/catalog/paths.js';
import { generateFixture, sha256 } from '../src/generators/fixtures.js';
import { inspectLegacyManifest } from '../src/migration/purejsimage.js';
import { applyMutations, type MutationOperation } from '../src/mutations/apply.js';
import { generatedFiles } from '../src/reporting/index.js';

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

  it('migrates the sibling PureJsImage manifest without missing fields or duplicate bytes', async () => {
    const manifest = JSON.parse(
      await readFile(fromRoot('../PureJsImage/benchmark/corpus/manifest.json'), 'utf8'),
    ) as unknown;
    expect(inspectLegacyManifest(manifest)).toEqual({
      total: 43,
      valid: 43,
      deduplicated: 0,
      errors: [],
      missingLicenses: [],
      missingHashes: [],
    });
  });
});
