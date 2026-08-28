import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { CorpusCase } from '../catalog/types.js';
import { materializeCase } from '../materialize/index.js';

interface ServedAsset {
  path: string;
  sha256: string;
  bytes: number;
  mediaType: string;
}

function parseRange(
  value: string | undefined,
  bytes: number,
): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match) throw new Error('invalid range');
  const startText = match[1] ?? '';
  const endText = match[2] ?? '';
  if (startText === '' && endText === '') throw new Error('invalid range');
  let start: number;
  let end: number;
  if (startText === '') {
    const suffix = Number(endText);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error('invalid range');
    start = Math.max(0, bytes - suffix);
    end = bytes - 1;
  } else {
    start = Number(startText);
    end = endText === '' ? bytes - 1 : Number(endText);
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    start >= bytes
  )
    throw new Error('unsatisfiable range');
  return { start, end: Math.min(end, bytes - 1) };
}

export async function createCorpusServer(
  cases: CorpusCase[],
  options: { root: string; cacheRoot: string; offline?: boolean },
): Promise<Server> {
  const assets = new Map<string, ServedAsset>();
  for (const corpusCase of cases) {
    const directory = await materializeCase(corpusCase, options);
    for (const asset of corpusCase.assets) {
      assets.set(`/cases/${corpusCase.id}/${asset.path}`, {
        path: join(directory, ...asset.path.split('/')),
        sha256: asset.sha256,
        bytes: asset.bytes,
        mediaType: asset.mediaType ?? 'application/octet-stream',
      });
    }
  }
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Range, If-None-Match');
    response.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, ETag');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const asset = assets.get(pathname);
    if (!asset) {
      response.writeHead(404);
      response.end();
      return;
    }
    await stat(asset.path);
    const etag = `"sha256-${asset.sha256}"`;
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('ETag', etag);
    response.setHeader('Content-Type', asset.mediaType);
    if (request.headers['if-none-match'] === etag) {
      response.writeHead(304);
      response.end();
      return;
    }
    let range: { start: number; end: number } | null;
    try {
      range = parseRange(request.headers.range, asset.bytes);
    } catch {
      response.writeHead(416, { 'Content-Range': `bytes */${asset.bytes}` });
      response.end();
      return;
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? asset.bytes - 1;
    const length = end - start + 1;
    response.setHeader('Content-Length', length);
    if (range) response.setHeader('Content-Range', `bytes ${start}-${end}/${asset.bytes}`);
    response.writeHead(range ? 206 : 200);
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(asset.path, { start, end }).pipe(response);
  };
  return createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      if (!response.headersSent) response.writeHead(500);
      response.end(error instanceof Error ? error.message : 'Internal server error');
    });
  });
}
