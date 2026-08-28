import type { SourceRecord } from './types.js';

export async function resolveGitHubRevision(
  source: SourceRecord,
  fetchImplementation: typeof fetch = fetch,
  token?: string,
): Promise<string> {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/|$)/.exec(source.homepage);
  if (!match) throw new Error(`Source does not have a GitHub repository homepage: ${source.id}`);
  const owner = match[1];
  const repository = match[2];
  if (!owner || !repository) throw new Error(`Cannot parse GitHub source: ${source.homepage}`);
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchImplementation(
    `https://api.github.com/repos/${owner}/${repository}/commits/${encodeURIComponent(source.trackingRef ?? 'HEAD')}`,
    { headers },
  );
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const value = (await response.json()) as { sha?: unknown };
  if (typeof value.sha !== 'string' || !/^[0-9a-f]{40}$/.test(value.sha)) {
    throw new Error('GitHub returned an invalid commit SHA');
  }
  return value.sha;
}
