import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Catalog, CollectionRecord, CorpusCase, SourceRecord } from './types.js';
import { fromRoot } from './paths.js';

async function jsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return jsonFiles(path);
      return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function readRecords<T>(directory: string): Promise<T[]> {
  return Promise.all((await jsonFiles(directory)).map(async (path) => (await readJson(path)) as T));
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${label} must be an array of strings`);
  }
  return [...value].sort();
}

export async function loadCatalog(root = fromRoot()): Promise<Catalog> {
  const [sources, cases, collections, featureDocument, formatDocument] = await Promise.all([
    readRecords<SourceRecord>(join(root, 'catalog/sources')),
    readRecords<CorpusCase>(join(root, 'catalog/cases')),
    readRecords<CollectionRecord>(join(root, 'catalog/collections')),
    readJson(join(root, 'catalog/taxonomy/features.json')),
    readJson(join(root, 'catalog/taxonomy/formats.json')),
  ]);
  const featureValue = featureDocument as { features?: unknown };
  const formatValue = formatDocument as { formats?: unknown };
  return {
    sources: sources.sort((a, b) => a.id.localeCompare(b.id)),
    cases: cases.sort((a, b) => a.id.localeCompare(b.id)),
    collections: collections.sort((a, b) => a.id.localeCompare(b.id)),
    features: readStringArray(featureValue.features, 'taxonomy features'),
    formats: readStringArray(formatValue.formats, 'taxonomy formats'),
  };
}

export function selectCollection(catalog: Catalog, id: string): CorpusCase[] {
  const collection = catalog.collections.find((candidate) => candidate.id === id);
  if (!collection) throw new Error(`Unknown collection: ${id}`);
  const explicit = new Set(collection.caseIds);
  const excluded = new Set(collection.exclusions);
  return catalog.cases.filter((candidate) => {
    if (excluded.has(candidate.id)) return false;
    if (explicit.has(candidate.id)) return true;
    return collection.selectors.some((selector) => {
      if (selector.domain !== undefined && candidate.domain !== selector.domain) return false;
      if (selector.formatFamily !== undefined && candidate.format.family !== selector.formatFamily)
        return false;
      if (selector.layoutKind !== undefined && candidate.layout.kind !== selector.layoutKind)
        return false;
      if (
        selector.classification !== undefined &&
        candidate.expected.classification !== selector.classification
      )
        return false;
      if (selector.feature !== undefined && !candidate.coverage.features.includes(selector.feature))
        return false;
      if (
        selector.storage !== undefined &&
        !candidate.assets.some((asset) => asset.storage === selector.storage)
      )
        return false;
      return true;
    });
  });
}
