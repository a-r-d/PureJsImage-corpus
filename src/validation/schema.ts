import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import { fromRoot } from '../catalog/paths.js';

export interface SchemaValidators {
  source: ValidateFunction;
  case: ValidateFunction;
  collection: ValidateFunction;
  recipe: ValidateFunction;
}

async function schema(name: string, root: string): Promise<object> {
  return JSON.parse(await readFile(join(root, 'schemas', `${name}.schema.json`), 'utf8')) as object;
}

export async function createSchemaValidators(root = fromRoot()): Promise<SchemaValidators> {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true,
  });
  ajv.addFormat('uri', {
    type: 'string',
    validate(value: string) {
      try {
        const url = new URL(value);
        return url.protocol.length > 1;
      } catch {
        return false;
      }
    },
  });
  ajv.addFormat('date-time', {
    type: 'string',
    validate(value: string) {
      return (
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
        !Number.isNaN(Date.parse(value))
      );
    },
  });
  const [sourceSchema, caseSchema, collectionSchema, recipeSchema] = await Promise.all([
    schema('source', root),
    schema('case', root),
    schema('collection', root),
    schema('recipe', root),
  ]);
  return {
    source: ajv.compile(sourceSchema),
    case: ajv.compile(caseSchema),
    collection: ajv.compile(collectionSchema),
    recipe: ajv.compile(recipeSchema),
  };
}

export function describeSchemaErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors) return 'unknown schema error';
  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}
