import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';
import { isSafeRelativePath } from '../validation/semantic.js';

export function validateArchiveMember(path: string): void {
  if (!isSafeRelativePath(path) || path.endsWith('/')) {
    throw new Error(`Unsafe archive member: ${path}`);
  }
}

export async function extractAllowedZip(
  archive: Uint8Array,
  destination: string,
  allowedMembers: readonly string[],
  maximumExtractedBytes: number,
): Promise<void> {
  const allowed = new Set(allowedMembers);
  for (const member of allowed) validateArchiveMember(member);
  const files = unzipSync(archive, {
    filter(file) {
      if (!isSafeRelativePath(file.name) && !file.name.endsWith('/')) {
        throw new Error(`Unsafe archive member: ${file.name}`);
      }
      return allowed.has(file.name);
    },
  });
  let total = 0;
  for (const member of allowed) {
    const bytes = files[member];
    if (!bytes) throw new Error(`Allowed archive member not found: ${member}`);
    total += bytes.byteLength;
    if (total > maximumExtractedBytes)
      throw new Error('Archive extraction exceeds configured limit');
    const output = join(destination, ...member.split('/'));
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, bytes, { flag: 'wx' });
  }
}
