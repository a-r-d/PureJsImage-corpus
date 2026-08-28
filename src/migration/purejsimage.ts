export interface LegacyManifestEntry {
  id?: unknown;
  file?: unknown;
  url?: unknown;
  sourcePage?: unknown;
  author?: unknown;
  license?: unknown;
  expected?: unknown;
}

export interface MigrationSummary {
  total: number;
  valid: number;
  deduplicated: number;
  errors: Array<{ index: number; id: string; message: string }>;
  missingLicenses: string[];
  missingHashes: string[];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function inspectLegacyManifest(value: unknown): MigrationSummary {
  const root = record(value);
  const entries = Array.isArray(root?.sources) ? (root.sources as LegacyManifestEntry[]) : [];
  const errors: MigrationSummary['errors'] = [];
  const missingLicenses: string[] = [];
  const missingHashes: string[] = [];
  const hashes = new Set<string>();
  let deduplicated = 0;
  let valid = 0;
  entries.forEach((entry, index) => {
    const id = typeof entry.id === 'string' ? entry.id : `entry-${index}`;
    const expected = record(entry.expected);
    const hash = expected?.sha256;
    const required = [entry.id, entry.file, entry.url, entry.sourcePage, entry.author];
    if (!required.every((item) => typeof item === 'string' && item.length > 0) || !expected) {
      errors.push({ index, id, message: 'Missing a required legacy field or expected object.' });
      return;
    }
    if (typeof entry.license !== 'string' || entry.license.length === 0) missingLicenses.push(id);
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) missingHashes.push(id);
    else if (hashes.has(hash)) deduplicated += 1;
    else hashes.add(hash);
    valid += 1;
  });
  return { total: entries.length, valid, deduplicated, errors, missingLicenses, missingHashes };
}
