import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
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

function hasExplicitDuplicateRelationship(
  candidate: CorpusCase,
  other: CorpusCase,
  hash: string,
  casesById: ReadonlyMap<string, CorpusCase>,
): boolean {
  if (
    candidate.relationships?.some((relationship) => relationship.caseId === other.id) ||
    other.relationships?.some((relationship) => relationship.caseId === candidate.id)
  ) {
    return true;
  }
  const otherParents = new Set(
    (other.relationships ?? [])
      .filter((relationship) => relationship.type === 'mutated-from')
      .map((relationship) => relationship.caseId),
  );
  return (candidate.relationships ?? []).some(
    (relationship) =>
      relationship.type === 'mutated-from' &&
      otherParents.has(relationship.caseId) &&
      casesById.get(relationship.caseId)?.assets.some((asset) => asset.sha256 === hash),
  );
}

function githubAssetIsPinned(value: string): boolean {
  const url = new URL(value);
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'raw.githubusercontent.com') return /^[0-9a-f]{40}$/u.test(parts[2] ?? '');
  if (url.hostname === 'github.com' && (parts[2] === 'blob' || parts[2] === 'tree')) {
    return /^[0-9a-f]{40}$/u.test(parts[3] ?? '');
  }
  return true;
}

function contradictoryUnknown(features: Set<string>, prefix: string): boolean {
  return (
    features.has(`${prefix}unknown`) &&
    [...features].some((feature) => feature.startsWith(prefix) && feature !== `${prefix}unknown`)
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
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    const actual = hash.digest('hex');
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
  const casesById = new Map(catalog.cases.map((corpusCase) => [corpusCase.id, corpusCase]));
  const hashes = new Map<string, CorpusCase>();
  const taxonomy = new Set(catalog.features);
  for (const corpusCase of catalog.cases) {
    if (caseIds.has(corpusCase.id)) issues.push(issue(corpusCase.id, 'duplicate case ID'));
    caseIds.add(corpusCase.id);
    const paths = new Set(corpusCase.assets.map((asset) => asset.path));
    if (!catalog.formats.includes(corpusCase.format.family)) {
      issues.push(issue(corpusCase.id, `unknown format family: ${corpusCase.format.family}`));
    }
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
    const claimedFeatures = new Set([
      ...corpusCase.format.features,
      ...corpusCase.coverage.features,
    ]);
    for (const feature of claimedFeatures) {
      if (!taxonomy.has(feature))
        issues.push(issue(corpusCase.id, `unknown feature claim: ${feature}`));
    }
    for (const prefix of ['image.bit-depth.', 'image.sample.', 'image.color.', 'compression.']) {
      if (contradictoryUnknown(claimedFeatures, prefix)) {
        issues.push(
          issue(corpusCase.id, `known and unknown feature claims conflict for ${prefix}`),
        );
      }
    }
    for (const feature of corpusCase.format.features) {
      if (!corpusCase.coverage.features.includes(feature)) {
        issues.push(issue(corpusCase.id, `format feature is missing from coverage: ${feature}`));
      }
    }
    if (corpusCase.expected.outcome === 'reject' && !corpusCase.expected.error) {
      issues.push(issue(corpusCase.id, 'expected rejection lacks an explicit error contract'));
    }
    if (corpusCase.expected.outcome !== 'reject' && corpusCase.expected.error) {
      issues.push(issue(corpusCase.id, 'non-rejection case has an error contract'));
    }
    const certification = corpusCase.certification;
    if (
      certification.status !== 'uncertified' &&
      certification.status !== 'generator-reviewed' &&
      certification.evidence.length === 0
    ) {
      issues.push(issue(corpusCase.id, `${certification.status} certification lacks evidence`));
    }
    if (certification.status === 'multi-oracle') {
      const implementations = new Set(
        certification.evidence.map((entry) => `${entry.implementation}@${entry.version}`),
      );
      if (implementations.size < 2) {
        issues.push(
          issue(corpusCase.id, 'multi-oracle certification requires two implementations'),
        );
      }
    }
    if (corpusCase.expected.comparison.method === 'exact') {
      const expectedHash = corpusCase.expected.comparison.sha256;
      const supported = certification.evidence.some(
        (entry) => entry.canonicalOutputSha256 === expectedHash,
      );
      if (!supported) {
        issues.push(issue(corpusCase.id, 'exact comparison lacks matching certification evidence'));
      }
    }
    if (
      corpusCase.expected.operations.includes('range-read') ||
      corpusCase.coverage.features.includes('http.range')
    ) {
      issues.push(issue(corpusCase.id, 'HTTP Range claims require an implemented execution plan'));
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
        if (url && !githubAssetIsPinned(url)) {
          issues.push(issue(corpusCase.id, `unpinned GitHub asset URL: ${url}`));
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
        !hasExplicitDuplicateRelationship(corpusCase, previous, asset.sha256, casesById)
      ) {
        issues.push(
          issue(corpusCase.id, `duplicate blob ${asset.sha256} also used by ${previous.id}`),
        );
      } else {
        hashes.set(asset.sha256, corpusCase);
      }
      issues.push(...(await validateBlob(root, corpusCase, assetIndex)));
    }
    const requiresPrivacyReview =
      corpusCase.format.family === 'dicom' || corpusCase.privacy.containsHumanData;
    const hasLocalAsset = corpusCase.assets.some((asset) => asset.storage !== 'external');
    if (
      hasLocalAsset &&
      (corpusCase.privacy.reviewStatus === 'pending' ||
        corpusCase.privacy.reviewStatus === 'failed' ||
        corpusCase.privacy.phi === 'present' ||
        (requiresPrivacyReview && corpusCase.privacy.reviewStatus !== 'passed'))
    ) {
      issues.push(
        issue(corpusCase.id, 'privacy-sensitive or unreviewed data must remain external'),
      );
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
    const selectedCases = selectCollection(catalog, collection.id);
    if (collection.id === 'smoke' || collection.id.endsWith('-smoke')) {
      for (const corpusCase of selectedCases) {
        if (corpusCase.certification.status === 'uncertified') {
          issues.push(issue(collection.id, `uncertified case in strict smoke: ${corpusCase.id}`));
        }
      }
    }
    for (const corpusCase of selectedCases) {
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
