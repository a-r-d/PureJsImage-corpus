export interface MutationOperation {
  op:
    | 'truncate'
    | 'overwrite-bytes'
    | 'insert-bytes'
    | 'delete-range'
    | 'duplicate-range'
    | 'flip-bit'
    | 'patch-u32-le'
    | 'patch-u32-be';
  offset?: number;
  length?: number;
  bytesHex?: string;
  bit?: number;
  value?: number;
}

function requireInteger(value: number | undefined, name: string): number {
  if (!Number.isInteger(value) || (value ?? -1) < 0) throw new Error(`${name} is required`);
  return value as number;
}

function splice(input: Uint8Array, offset: number, remove: number, insert: Uint8Array): Uint8Array {
  if (offset + remove > input.byteLength) throw new Error('Mutation range exceeds input');
  const output = new Uint8Array(input.byteLength - remove + insert.byteLength);
  output.set(input.subarray(0, offset));
  output.set(insert, offset);
  output.set(input.subarray(offset + remove), offset + insert.byteLength);
  return output;
}

export function applyMutations(
  input: Uint8Array,
  operations: readonly MutationOperation[],
): Uint8Array {
  let output: Uint8Array = input.slice();
  for (const operation of operations) {
    const offset = operation.offset ?? 0;
    switch (operation.op) {
      case 'truncate':
        output = output.slice(0, requireInteger(operation.length, 'length'));
        break;
      case 'overwrite-bytes': {
        const bytes = Uint8Array.from(Buffer.from(operation.bytesHex ?? '', 'hex'));
        if (offset + bytes.byteLength > output.byteLength)
          throw new Error('Overwrite exceeds input');
        output.set(bytes, offset);
        break;
      }
      case 'insert-bytes':
        output = splice(
          output,
          offset,
          0,
          Uint8Array.from(Buffer.from(operation.bytesHex ?? '', 'hex')),
        );
        break;
      case 'delete-range':
        output = splice(
          output,
          offset,
          requireInteger(operation.length, 'length'),
          new Uint8Array(),
        );
        break;
      case 'duplicate-range': {
        const length = requireInteger(operation.length, 'length');
        output = splice(output, offset + length, 0, output.slice(offset, offset + length));
        break;
      }
      case 'flip-bit': {
        const bit = requireInteger(operation.bit, 'bit');
        if (offset >= output.byteLength || bit > 7) throw new Error('Invalid bit mutation');
        output[offset] = (output[offset] ?? 0) ^ (1 << bit);
        break;
      }
      case 'patch-u32-le':
      case 'patch-u32-be': {
        const value = requireInteger(operation.value, 'value');
        if (offset + 4 > output.byteLength) throw new Error('Integer patch exceeds input');
        new DataView(output.buffer, output.byteOffset, output.byteLength).setUint32(
          offset,
          value,
          operation.op === 'patch-u32-le',
        );
        break;
      }
    }
  }
  return output;
}
