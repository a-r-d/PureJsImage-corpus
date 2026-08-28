import { join } from 'node:path';
import { fromRoot } from '../catalog/paths.js';

export function blobPath(sha256: string, root = fromRoot('.cache')): string {
  return join(root, 'blobs', 'sha256', sha256.slice(0, 2), sha256);
}

export function vendoredBlobPath(sha256: string, root = fromRoot()): string {
  return join(root, 'assets', 'vendored', 'sha256', sha256.slice(0, 2), sha256);
}

export function materializedPath(caseId: string, root = fromRoot('.cache')): string {
  return join(root, 'materialized', ...caseId.split('/'));
}
