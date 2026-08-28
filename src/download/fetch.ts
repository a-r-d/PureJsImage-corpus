import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, type Dirent } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import type { CaseAsset } from '../catalog/types.js';
import { blobPath } from '../cache/paths.js';

export interface DownloadOptions {
  cacheRoot: string;
  offline?: boolean;
  retries?: number;
  maximumBytes?: number;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
}

async function validBlob(
  path: string,
  expectedHash: string,
  expectedBytes: number,
): Promise<boolean> {
  try {
    const info = await stat(path);
    if (info.size !== expectedBytes) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    return hash.digest('hex') === expectedHash;
  } catch {
    return false;
  }
}

async function acquireLock(path: string): Promise<() => Promise<void>> {
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const handle = await open(path, 'wx');
      await handle.writeFile(`${process.pid}\n`);
      return async () => {
        await handle.close();
        await rm(path, { force: true });
      };
    } catch (error: unknown) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      try {
        const existing = await stat(path);
        if (Date.now() - existing.mtimeMs > 30 * 60_000) {
          await rm(path, { force: true });
          continue;
        }
      } catch {
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 + attempt * 2));
    }
  }
  throw new Error(`Timed out waiting for cache lock: ${path}`);
}

async function fetchOnce(
  url: string,
  destination: string,
  asset: CaseAsset,
  maximumBytes: number,
  timeoutMs: number,
  fetchImplementation: typeof fetch,
): Promise<void> {
  const response = await fetchImplementation(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}`);
  const finalUrl = new URL(response.url || url);
  if (!['http:', 'https:'].includes(finalUrl.protocol)) {
    throw new Error(`Unsafe redirect protocol: ${finalUrl.protocol}`);
  }
  const declared = response.headers.get('content-length');
  if (declared && Number(declared) > maximumBytes) {
    throw new Error(`Declared size ${declared} exceeds maximum ${maximumBytes}`);
  }
  let bytes = 0;
  const hash = createHash('sha256');
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.byteLength;
      if (bytes > maximumBytes) {
        callback(new Error(`Download exceeds maximum ${maximumBytes} bytes`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  async function* chunks(): AsyncGenerator<Uint8Array> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body disappeared');
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) return;
        yield result.value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  await pipeline(Readable.from(chunks()), meter, createWriteStream(destination, { flags: 'wx' }));
  const actualHash = hash.digest('hex');
  if (bytes !== asset.bytes)
    throw new Error(`Byte-size mismatch: expected ${asset.bytes}, got ${bytes}`);
  if (actualHash !== asset.sha256) {
    throw new Error(`Checksum mismatch: expected ${asset.sha256}, got ${actualHash}`);
  }
}

export async function fetchAsset(asset: CaseAsset, options: DownloadOptions): Promise<string> {
  const destination = blobPath(asset.sha256, options.cacheRoot);
  if (await validBlob(destination, asset.sha256, asset.bytes)) return destination;
  if (options.offline) throw new Error(`Offline cache miss for ${asset.sha256}`);
  const urls = [asset.resolvedUrl, ...(asset.mirrors ?? [])].filter(
    (candidate): candidate is string => candidate !== undefined,
  );
  if (urls.length === 0) throw new Error(`No URL for external asset ${asset.path}`);
  const release = await acquireLock(`${destination}.lock`);
  try {
    if (await validBlob(destination, asset.sha256, asset.bytes)) return destination;
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
    let lastError: unknown;
    const retries = options.retries ?? 2;
    for (const url of urls) {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          await rm(temporary, { force: true });
          await fetchOnce(
            url,
            temporary,
            asset,
            Math.min(options.maximumBytes ?? asset.bytes, asset.bytes),
            options.timeoutMs ?? 60_000,
            options.fetchImplementation ?? fetch,
          );
          await rename(temporary, destination);
          return destination;
        } catch (error: unknown) {
          lastError = error;
          await rm(temporary, { force: true });
          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
          }
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  } finally {
    await release();
  }
}

export async function cleanTemporaryFiles(cacheRoot: string, olderThanMs: number): Promise<number> {
  const base = `${cacheRoot}/blobs/sha256`;
  let removed = 0;
  async function visit(directory: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await import('node:fs/promises').then(({ readdir }) =>
        readdir(directory, { withFileTypes: true }),
      );
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) return visit(path);
        if (!entry.name.includes('.tmp-')) return;
        const info = await stat(path);
        if (Date.now() - info.mtimeMs > olderThanMs) {
          await rm(path, { force: true });
          removed += 1;
        }
      }),
    );
  }
  await visit(base);
  return removed;
}
