import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCatalog } from '../catalog/load.js';
import { fromRoot } from '../catalog/paths.js';
import { createSchemaValidators, describeSchemaErrors } from './schema.js';
import { validateSemantics, type ValidationIssue } from './semantic.js';

async function jsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const values = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? jsonFiles(path)
        : entry.isFile() && entry.name.endsWith('.json')
          ? [path]
          : [];
    }),
  );
  return values.flat().sort();
}

export async function validateRepository(root = fromRoot()): Promise<ValidationIssue[]> {
  const validators = await createSchemaValidators(root);
  const issues: ValidationIssue[] = [];
  const groups = [
    { directory: 'catalog/sources', validate: validators.source },
    { directory: 'catalog/cases', validate: validators.case },
    { directory: 'catalog/collections', validate: validators.collection },
    { directory: 'recipes', validate: validators.recipe },
  ];
  for (const group of groups) {
    for (const path of await jsonFiles(join(root, group.directory))) {
      let value: unknown;
      try {
        value = JSON.parse(await readFile(path, 'utf8')) as unknown;
      } catch (error: unknown) {
        issues.push({ location: path, message: `invalid JSON: ${String(error)}` });
        continue;
      }
      if (!group.validate(value)) {
        issues.push({ location: path, message: describeSchemaErrors(group.validate.errors) });
      }
    }
  }
  if (issues.length === 0) {
    issues.push(...(await validateSemantics(await loadCatalog(root), root)));
  }
  return issues;
}
