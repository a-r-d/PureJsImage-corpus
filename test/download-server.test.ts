import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import type { CaseAsset } from '../src/catalog/types.js';
import { fetchAsset } from '../src/download/fetch.js';
import { loadCatalog } from '../src/catalog/load.js';
import { fromRoot } from '../src/catalog/paths.js';
import { extractAllowedZip, validateArchiveMember } from '../src/materialize/archive.js';
import { materializeCase } from '../src/materialize/index.js';
import { createCorpusServer } from '../src/server/index.js';

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(async (fn) => fn()));
});

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  return (server.address() as AddressInfo).port;
}

describe('downloading, archives, and range serving', () => {
  it('downloads atomically, reuses cache, fails offline misses, and rejects bad checksums', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    let requests = 0;
    const upstream = createServer((_request, response) => {
      requests += 1;
      response.writeHead(200, { 'Content-Length': bytes.byteLength });
      response.end(bytes);
    });
    const port = await listen(upstream);
    const cacheRoot = await mkdtemp(`${tmpdir()}/corpus-download-`);
    cleanup.push(async () => rm(cacheRoot, { recursive: true }));
    const asset: CaseAsset = {
      path: 'input.bin',
      role: 'primary',
      storage: 'external',
      sourceId: 'test',
      resolvedUrl: `http://127.0.0.1:${port}/input.bin`,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    const first = await fetchAsset(asset, { cacheRoot });
    expect(await readFile(first)).toEqual(Buffer.from(bytes));
    expect(await fetchAsset(asset, { cacheRoot, offline: true })).toBe(first);
    expect(requests).toBe(1);
    const prefixFiles = await readdir(`${cacheRoot}/blobs/sha256/${asset.sha256.slice(0, 2)}`);
    expect(prefixFiles.some((name) => name.includes('.tmp-'))).toBe(false);
    await expect(fetchAsset({ ...asset, sha256: '11'.repeat(32) }, { cacheRoot })).rejects.toThrow(
      'Checksum mismatch',
    );
    await expect(
      fetchAsset({ ...asset, sha256: '22'.repeat(32) }, { cacheRoot, offline: true }),
    ).rejects.toThrow('Offline cache miss');
  });

  it('rejects traversal and absolute archive paths', () => {
    expect(() => validateArchiveMember('../escape.bin')).toThrow('Unsafe archive member');
    expect(() => validateArchiveMember('/absolute.bin')).toThrow('Unsafe archive member');
    expect(() => validateArchiveMember('safe/file.bin')).not.toThrow();
  });

  it('bounds archive expansion while streaming', async () => {
    const destination = await mkdtemp(`${tmpdir()}/corpus-archive-`);
    cleanup.push(async () => rm(destination, { recursive: true }));
    const archive = zipSync({ 'large.bin': new Uint8Array(1024 * 1024) });
    await expect(extractAllowedZip(archive, destination, ['large.bin'], 1024)).rejects.toThrow(
      'configured limit',
    );
  });

  it('materializes copies that cannot mutate canonical blobs', async () => {
    const catalog = await loadCatalog();
    const corpusCase = catalog.cases.find((candidate) => candidate.id === 'ordinary/qoi/rgba-2x2');
    const asset = corpusCase?.assets[0];
    if (!corpusCase || !asset) throw new Error('QOI materialization fixture is missing');
    const cacheRoot = await mkdtemp(`${tmpdir()}/corpus-materialize-`);
    cleanup.push(async () => rm(cacheRoot, { recursive: true }));
    const directory = await materializeCase(corpusCase, {
      root: fromRoot(),
      cacheRoot,
      offline: true,
    });
    const source = `${fromRoot()}/assets/vendored/sha256/${asset.sha256.slice(0, 2)}/${asset.sha256}`;
    const output = `${directory}/${asset.path}`;
    expect((await stat(output)).ino).not.toBe((await stat(source)).ino);
    const canonical = await readFile(source);
    await writeFile(output, new Uint8Array(canonical.byteLength));
    expect(await readFile(source)).toEqual(canonical);
  });

  it('serves GET, HEAD, 206, 304, and 416 with SHA-256 ETags and CORS', async () => {
    const catalog = await loadCatalog();
    const corpusCase = catalog.cases.find((candidate) => candidate.id === 'ordinary/qoi/rgba-2x2');
    if (!corpusCase) throw new Error('QOI server fixture is missing');
    const asset = corpusCase.assets[0];
    if (!asset) throw new Error('QOI server fixture has no asset');
    const cacheRoot = await mkdtemp(`${tmpdir()}/corpus-server-`);
    cleanup.push(async () => rm(cacheRoot, { recursive: true }));
    const server = await createCorpusServer([corpusCase], {
      root: fromRoot(),
      cacheRoot,
      offline: true,
    });
    const port = await listen(server);
    const url = `http://127.0.0.1:${port}/cases/${corpusCase.id}/${corpusCase.layout.entrypoint}`;
    const head = await fetch(url, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String(asset.bytes));
    expect(head.headers.get('access-control-allow-origin')).toBe('*');
    const etag = head.headers.get('etag');
    expect(etag).toBe(`"sha256-${asset.sha256}"`);
    const partial = await fetch(url, { headers: { Range: 'bytes=1-3' } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe(`bytes 1-3/${asset.bytes}`);
    expect((await partial.arrayBuffer()).byteLength).toBe(3);
    expect((await fetch(url, { headers: { Range: 'bytes=999999-' } })).status).toBe(416);
    if (!etag) throw new Error('Server omitted ETag');
    expect((await fetch(url, { headers: { 'If-None-Match': etag } })).status).toBe(304);
  });
});
