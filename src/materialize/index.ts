import { copyFile, link, mkdir, rm } from 'node:fs/promises';
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
  await rm(destination, { recursive: true, force: true });
  for (const asset of corpusCase.assets) {
    const source =
      asset.storage === 'external'
        ? await fetchAsset(asset, {
            cacheRoot: options.cacheRoot,
            offline: options.offline ?? false,
          })
        : vendoredBlobPath(asset.sha256, options.root);
    const output = join(destination, ...asset.path.split('/'));
    await mkdir(dirname(output), { recursive: true });
    try {
      await link(source, output);
    } catch {
      await copyFile(source, output);
    }
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
