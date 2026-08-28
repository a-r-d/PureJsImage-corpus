import { describe, expect, it } from 'vitest';
import { resolveGitHubRevision } from '../src/catalog/update-source.js';
import type { SourceRecord } from '../src/catalog/types.js';

const source: SourceRecord = {
  schemaVersion: 1,
  id: 'project',
  project: 'Project',
  homepage: 'https://github.com/example/project/tree/main/data',
  sourceType: 'github-tree',
  trackingRef: 'main',
  pinnedRevision: '0'.repeat(40),
  evidence: { sourceUrls: ['https://github.com/example/project'], licenseUrls: [] },
  defaultRedistribution: 'unknown',
  expectedStability: 'repository',
  updatePolicy: 'Manual.',
  notes: [],
};

describe('source update pinning', () => {
  it('resolves a tracking ref to an exact commit without accepting changed bytes', async () => {
    const sha = 'a'.repeat(40);
    let requestedUrl = '';
    let authorization = '';
    const mockFetch: typeof fetch = (input, init) => {
      requestedUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      authorization = new Headers(init?.headers).get('authorization') ?? '';
      return Promise.resolve(new Response(JSON.stringify({ sha }), { status: 200 }));
    };
    expect(await resolveGitHubRevision(source, mockFetch, 'token')).toBe(sha);
    expect(requestedUrl).toBe('https://api.github.com/repos/example/project/commits/main');
    expect(authorization).toBe('Bearer token');
    expect(source.pinnedRevision).toBe('0'.repeat(40));
  });

  it('fails closed on an invalid revision response', async () => {
    await expect(
      resolveGitHubRevision(source, () =>
        Promise.resolve(new Response('{"sha":"main"}', { status: 200 })),
      ),
    ).rejects.toThrow('invalid commit SHA');
  });
});
