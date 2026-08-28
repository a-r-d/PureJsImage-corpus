import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(here, '../..');

export function fromRoot(...parts: string[]): string {
  return resolve(repositoryRoot, ...parts);
}
