import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Unzip, UnzipInflate } from 'fflate';
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
  const files = new Map<string, Uint8Array>();
  let total = 0;
  let failure: Error | undefined;
  const unzip = new Unzip((file) => {
    const normalized = file.name.endsWith('/') ? file.name.slice(0, -1) : file.name;
    if (!isSafeRelativePath(normalized)) {
      failure = new Error(`Unsafe archive member: ${file.name}`);
      file.terminate();
      return;
    }
    if (!allowed.has(file.name)) return;
    if (file.originalSize !== undefined && total + file.originalSize > maximumExtractedBytes) {
      failure = new Error('Archive extraction exceeds configured limit');
      file.terminate();
      return;
    }
    const chunks: Uint8Array[] = [];
    let memberBytes = 0;
    file.ondata = (error, chunk, final) => {
      if (failure) return;
      if (error) {
        failure = error;
        return;
      }
      memberBytes += chunk.byteLength;
      total += chunk.byteLength;
      if (total > maximumExtractedBytes) {
        failure = new Error('Archive extraction exceeds configured limit');
        file.terminate();
        return;
      }
      chunks.push(chunk.slice());
      if (final) {
        const output = new Uint8Array(memberBytes);
        let offset = 0;
        for (const part of chunks) {
          output.set(part, offset);
          offset += part.byteLength;
        }
        files.set(file.name, output);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.push(archive, true);
  if (failure) throw failure;
  for (const member of allowed) {
    const bytes = files.get(member);
    if (!bytes) throw new Error(`Allowed archive member not found: ${member}`);
    const output = join(destination, ...member.split('/'));
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, bytes, { flag: 'wx' });
  }
}
