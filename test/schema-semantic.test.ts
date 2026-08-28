import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { vendoredBlobPath } from '../src/cache/paths.js';
import type { Catalog, CorpusCase, SourceRecord } from '../src/catalog/types.js';
import { createSchemaValidators } from '../src/validation/schema.js';
import { isSafeRelativePath, validateSemantics } from '../src/validation/semantic.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

const source: SourceRecord = {
  schemaVersion: 1,
  id: 'test-source',
  project: 'Test source',
  homepage: 'https://example.com/source',
  sourceType: 'http-file',
  pinnedRevision: 'sha256-pinned',
  evidence: {
    sourceUrls: ['https://example.com/source'],
    licenseUrls: ['https://example.com/license'],
  },
  defaultRedistribution: 'unknown',
  expectedStability: 'immutable',
  updatePolicy: 'Manual review.',
  notes: [],
};

function corpusCase(id = 'ordinary/test/base'): CorpusCase {
  return {
    schemaVersion: 1,
    id,
    caseRevision: 1,
    title: 'Test case',
    description: 'A semantic validator fixture.',
    domain: 'ordinary',
    format: {
      family: 'test',
      extensions: ['bin'],
      mediaTypes: ['application/octet-stream'],
      features: ['format.test'],
    },
    layout: { kind: 'single-file', entrypoint: 'input.bin', requiredPaths: ['input.bin'] },
    assets: [
      {
        path: 'input.bin',
        role: 'primary',
        storage: 'external',
        sourceId: 'test-source',
        resolvedUrl: 'https://example.com/immutable/input.bin',
        bytes: 1,
        sha256: '00'.repeat(32),
      },
    ],
    provenance: {
      sourceId: 'test-source',
      originalUrl: 'https://example.com/immutable/input.bin',
      resolvedAt: '2026-08-28T00:00:00.000Z',
      method: 'indexed',
    },
    rights: {
      licenseName: 'Unknown',
      evidenceUrl: 'https://example.com/license',
      attribution: '',
      redistribution: 'unknown',
    },
    privacy: {
      reviewStatus: 'not-required',
      containsHumanData: false,
      phi: 'none',
      burnedInText: 'none',
      gps: 'none',
      faces: 'none',
      deidentified: 'not-applicable',
      notes: [],
    },
    expected: {
      classification: 'valid',
      outcome: 'success',
      operations: ['metadata'],
      comparison: { method: 'structural' },
      metadata: {},
      resourceLimits: {
        timeoutMs: 1000,
        maxInputBytes: 1,
        maxDecodedPixels: 1,
        maxFrames: 1,
        maxHeapMiB: 16,
      },
    },
    coverage: {
      features: ['format.test'],
      selectionReason: 'Tests validation.',
      priority: 'high',
    },
    collections: ['test'],
    notes: [],
  };
}

function catalog(cases: CorpusCase[] = [corpusCase()]): Catalog {
  return {
    sources: [source],
    cases,
    collections: [
      {
        schemaVersion: 1,
        id: 'test',
        title: 'Test',
        description: 'Test collection.',
        intendedUse: 'Tests',
        networkPolicy: 'optional',
        maximumVendoredBytes: 1024,
        caseIds: cases.map((item) => item.id),
        selectors: [],
        exclusions: [],
      },
    ],
    features: ['format.test'],
    formats: ['test'],
  };
}

describe('schema and semantic validation', () => {
  it('accepts a complete case schema and rejects extra properties', async () => {
    const validators = await createSchemaValidators();
    const value = corpusCase();
    expect(validators.case(value)).toBe(true);
    expect(validators.case({ ...value, placeholder: true })).toBe(false);
  });

  it.each(['../escape', '/absolute', 'C:/drive', 'a\\b', 'a//b', 'a/./b', 'a/../b'])(
    'rejects unsafe paths: %s',
    (path) => expect(isSafeRelativePath(path)).toBe(false),
  );

  it('reports duplicate case IDs and byte hashes', async () => {
    const duplicateId = structuredClone(corpusCase());
    const duplicateHash = corpusCase('ordinary/test/other');
    const issues = await validateSemantics(
      catalog([corpusCase(), duplicateId, duplicateHash]),
      '.',
    );
    expect(issues.some((item) => item.message === 'duplicate case ID')).toBe(true);
    expect(issues.some((item) => item.message.includes('duplicate blob'))).toBe(true);
  });

  it('reports unsafe paths, missing entrypoints, unresolved sources, and floating GitHub URLs', async () => {
    const value = corpusCase();
    const firstAsset = value.assets[0];
    if (!firstAsset) throw new Error('Semantic fixture has no asset');
    value.layout.entrypoint = 'missing.bin';
    value.assets[0] = {
      ...firstAsset,
      path: '../escape.bin',
      sourceId: 'missing-source',
      resolvedUrl: 'https://raw.githubusercontent.com/example/project/main/input.bin',
    };
    const issues = await validateSemantics(catalog([value]), '.');
    expect(issues.map((item) => item.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('entrypoint is not an asset'),
        expect.stringContaining('unsafe asset path'),
        expect.stringContaining('unknown source'),
        expect.stringContaining('floating GitHub'),
      ]),
    );
  });

  it('reports redistribution, taxonomy, and collection-size violations', async () => {
    const value = corpusCase();
    const firstAsset = value.assets[0];
    const firstCollection = catalog([value]).collections[0];
    if (!firstAsset || !firstCollection) throw new Error('Semantic fixture is incomplete');
    value.assets[0] = { ...firstAsset, storage: 'generated', bytes: 2048 };
    value.coverage.features.push('feature.unknown');
    const testCatalog = catalog([value]);
    const collection = testCatalog.collections[0];
    if (!collection) throw new Error('Semantic fixture has no collection');
    collection.maximumVendoredBytes = 1;
    const issues = await validateSemantics(testCatalog, '.');
    expect(issues.map((item) => item.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('not redistribution allowed'),
        expect.stringContaining('unknown feature claim'),
        expect.stringContaining('exceeds configured maximum'),
      ]),
    );
  });

  it('detects byte-size and checksum mismatches in committed blobs', async () => {
    const root = await mkdtemp(`${tmpdir()}/corpus-semantic-`);
    temporaryDirectories.push(root);
    const bytes = new Uint8Array([1, 2, 3]);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const path = vendoredBlobPath(hash, root);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    const value = corpusCase();
    const firstAsset = value.assets[0];
    if (!firstAsset) throw new Error('Semantic fixture has no asset');
    value.rights.redistribution = 'allowed';
    value.assets[0] = {
      ...firstAsset,
      storage: 'vendored',
      sha256: hash,
      bytes: 2,
    };
    let issues = await validateSemantics(catalog([value]), root);
    expect(issues.some((item) => item.message.includes('byte-size mismatch'))).toBe(true);
    const vendoredAsset = value.assets[0];
    vendoredAsset.bytes = 3;
    vendoredAsset.sha256 = '11'.repeat(32);
    const wrongPath = vendoredBlobPath(vendoredAsset.sha256, root);
    await mkdir(dirname(wrongPath), { recursive: true });
    await writeFile(wrongPath, bytes);
    issues = await validateSemantics(catalog([value]), root);
    expect(issues.some((item) => item.message.includes('checksum mismatch'))).toBe(true);
  });
});
