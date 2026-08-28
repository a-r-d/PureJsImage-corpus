import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CorpusCase } from '../catalog/types.js';
import { blobPath, materializedPath, vendoredBlobPath } from '../cache/paths.js';
import { fetchAsset } from '../download/fetch.js';

export interface MaterializeOptions {
  root: string;
  cacheRoot: string;
  offline?: boolean;
}

export async function materializeCase(
  corpusCase: CorpusCase,
  options: MaterializeOptions,
): Promise<string> {
  const destination = materializedPath(corpusCase.id, options.cacheRoot);
  const staging = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  try {
    for (const asset of corpusCase.assets) {
      const source =
        asset.storage === 'external'
          ? await fetchAsset(asset, {
              cacheRoot: options.cacheRoot,
              offline: options.offline ?? false,
            })
          : vendoredBlobPath(asset.sha256, options.root);
      const output = join(staging, ...asset.path.split('/'));
      await mkdir(dirname(output), { recursive: true });
      // A hard link would let a misbehaving reader mutate the canonical content-addressed blob.
      // Reflink copies preserve copy-on-write efficiency without sharing write identity.
      await copyFile(source, output, constants.COPYFILE_FICLONE);
    }
    await rm(destination, { recursive: true, force: true });
    await mkdir(dirname(destination), { recursive: true });
    await rename(staging, destination);
  } catch (error: unknown) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return destination;
}

export async function verifyCachedAsset(
  asset: CorpusCase['assets'][number],
  options: MaterializeOptions,
): Promise<string> {
  return asset.storage === 'external'
    ? fetchAsset(asset, { cacheRoot: options.cacheRoot, offline: true })
    : vendoredBlobPath(asset.sha256, options.root);
}

export { blobPath };
