import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, win32 } from 'node:path';
import type { Catalog, CorpusCase } from '../catalog/types.js';
import { selectCollection } from '../catalog/load.js';
import { vendoredBlobPath } from '../cache/paths.js';

export interface ValidationIssue {
  location: string;
  message: string;
}

function issue(location: string, message: string): ValidationIssue {
  return { location, message };
}

export function isSafeRelativePath(path: string): boolean {
  if (path.includes('\0') || path.includes('\\')) return false;
  if (isAbsolute(path) || win32.isAbsolute(path)) return false;
  const pieces = path.split('/');
  return (
    pieces.length > 0 && pieces.every((piece) => piece !== '' && piece !== '.' && piece !== '..')
  );
}

function hasExplicitDuplicateRelationship(candidate: CorpusCase, other: CorpusCase): boolean {
  return Boolean(
    candidate.relationships?.length ||
    other.relationships?.length ||
    candidate.relationships?.some((relationship) => relationship.caseId === other.id) ||
    other.relationships?.some((relationship) => relationship.caseId === candidate.id),
  );
}

async function validateBlob(
  root: string,
  corpusCase: CorpusCase,
  assetIndex: number,
): Promise<ValidationIssue[]> {
  const asset = corpusCase.assets[assetIndex];
  if (!asset || asset.storage === 'external') return [];
  const location = `${corpusCase.id}/assets/${assetIndex}`;
  const path = vendoredBlobPath(asset.sha256, root);
  try {
    const info = await stat(path);
    if (info.size !== asset.bytes) {
      return [issue(location, `byte-size mismatch: catalog=${asset.bytes}, file=${info.size}`)];
    }
    const bytes = await readFile(path);
    const actual = createHash('sha256').update(bytes).digest('hex');
    return actual === asset.sha256
      ? []
      : [issue(location, `checksum mismatch: catalog=${asset.sha256}, file=${actual}`)];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return [issue(location, `missing content blob ${path}: ${message}`)];
  }
}

export async function validateSemantics(
  catalog: Catalog,
  root: string,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const sourceIds = new Set<string>();
  for (const source of catalog.sources) {
    if (sourceIds.has(source.id)) issues.push(issue(source.id, 'duplicate source ID'));
    sourceIds.add(source.id);
  }
  const collectionIds = new Set<string>();
  for (const collection of catalog.collections) {
    if (collectionIds.has(collection.id))
      issues.push(issue(collection.id, 'duplicate collection ID'));
    collectionIds.add(collection.id);
  }
  const caseIds = new Set<string>();
  const hashes = new Map<string, CorpusCase>();
  const taxonomy = new Set(catalog.features);
  for (const corpusCase of catalog.cases) {
    if (caseIds.has(corpusCase.id)) issues.push(issue(corpusCase.id, 'duplicate case ID'));
    caseIds.add(corpusCase.id);
    const paths = new Set(corpusCase.assets.map((asset) => asset.path));
    if (!paths.has(corpusCase.layout.entrypoint)) {
      issues.push(
        issue(corpusCase.id, `entrypoint is not an asset: ${corpusCase.layout.entrypoint}`),
      );
    }
    for (const required of corpusCase.layout.requiredPaths) {
      if (!paths.has(required))
        issues.push(issue(corpusCase.id, `required path is not an asset: ${required}`));
    }
    for (const path of paths) {
      if (!isSafeRelativePath(path))
        issues.push(issue(corpusCase.id, `unsafe asset path: ${path}`));
    }
    if (!sourceIds.has(corpusCase.provenance.sourceId)) {
      issues.push(
        issue(corpusCase.id, `unknown provenance source: ${corpusCase.provenance.sourceId}`),
      );
    }
    for (const collection of corpusCase.collections) {
      if (!collectionIds.has(collection))
        issues.push(issue(corpusCase.id, `unknown collection: ${collection}`));
    }
    for (const feature of new Set([
      ...corpusCase.format.features,
      ...corpusCase.coverage.features,
    ])) {
      if (!taxonomy.has(feature))
        issues.push(issue(corpusCase.id, `unknown feature claim: ${feature}`));
    }
    for (const [assetIndex, asset] of corpusCase.assets.entries()) {
      if (!sourceIds.has(asset.sourceId))
        issues.push(
          issue(corpusCase.id, `asset ${asset.path} references unknown source ${asset.sourceId}`),
        );
      if (asset.storage === 'external' && !asset.resolvedUrl) {
        issues.push(issue(corpusCase.id, `external asset lacks resolvedUrl: ${asset.path}`));
      }
      for (const url of [asset.resolvedUrl, ...(asset.mirrors ?? [])]) {
        if (url && /github(?:usercontent)?\.com\/.*\/(?:main|master)\//i.test(url)) {
          issues.push(issue(corpusCase.id, `floating GitHub asset URL: ${url}`));
        }
      }
      if (asset.storage !== 'external' && corpusCase.rights.redistribution !== 'allowed') {
        issues.push(
          issue(
            corpusCase.id,
            `${asset.storage} asset is not redistribution allowed: ${asset.path}`,
          ),
        );
      }
      const previous = hashes.get(asset.sha256);
      if (
        previous &&
        previous.id !== corpusCase.id &&
        !hasExplicitDuplicateRelationship(corpusCase, previous)
      ) {
        issues.push(
          issue(corpusCase.id, `duplicate blob ${asset.sha256} also used by ${previous.id}`),
        );
      } else {
        hashes.set(asset.sha256, corpusCase);
      }
      issues.push(...(await validateBlob(root, corpusCase, assetIndex)));
    }
    const isMedical = corpusCase.format.family === 'dicom' || corpusCase.privacy.containsHumanData;
    if (isMedical && corpusCase.privacy.reviewStatus === 'pending') {
      if (corpusCase.assets.some((asset) => asset.storage !== 'external')) {
        issues.push(
          issue(corpusCase.id, 'medical data pending privacy review must remain external'),
        );
      }
    }
  }
  for (const corpusCase of catalog.cases) {
    for (const relationship of corpusCase.relationships ?? []) {
      if (!caseIds.has(relationship.caseId))
        issues.push(issue(corpusCase.id, `unknown related case: ${relationship.caseId}`));
    }
  }
  for (const collection of catalog.collections) {
    for (const id of [...collection.caseIds, ...collection.exclusions]) {
      if (!caseIds.has(id)) issues.push(issue(collection.id, `unknown case ID: ${id}`));
    }
    const vendoredHashes = new Set<string>();
    let bytes = 0;
    for (const corpusCase of selectCollection(catalog, collection.id)) {
      for (const asset of corpusCase.assets) {
        if (asset.storage !== 'external' && !vendoredHashes.has(asset.sha256)) {
          vendoredHashes.add(asset.sha256);
          bytes += asset.bytes;
        }
      }
    }
    if (bytes > collection.maximumVendoredBytes) {
      issues.push(
        issue(
          collection.id,
          `vendored size ${bytes} exceeds configured maximum ${collection.maximumVendoredBytes}`,
        ),
      );
    }
  }
  return issues;
}
