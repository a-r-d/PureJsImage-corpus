import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CorpusCase, Domain } from '../catalog/types.js';
import type {
  PureJsImageAdapter,
  PureJsImageWorkerRequest,
  PureJsImageWorkerResult,
} from './types.js';

type UnknownRecord = Record<string, unknown>;

interface ReaderDescriptor extends UnknownRecord {
  id: string;
  version: string;
}

interface Reader {
  descriptor: ReaderDescriptor;
  probe(context: unknown): Promise<{ confidence: number; reason?: string }>;
  open(context: unknown): Promise<unknown>;
}

function record(value: unknown, label: string): UnknownRecord {
  if (value === null || typeof value !== 'object') throw new Error(`${label} is not an object`);
  return value as UnknownRecord;
}

function callable(value: unknown, label: string): (...args: unknown[]) => unknown {
  if (typeof value !== 'function') throw new Error(`${label} is not callable`);
  return value as (...args: unknown[]) => unknown;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${label} is not numeric`);
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is not text`);
  return value;
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`);
  return value;
}

function isDomain(value: unknown): value is Domain {
  return value === 'ordinary' || value === 'scientific' || value === 'geo' || value === 'negative';
}

function isCorpusCase(value: unknown): value is CorpusCase {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as UnknownRecord;
  if (candidate.format === null || typeof candidate.format !== 'object') return false;
  if (candidate.layout === null || typeof candidate.layout !== 'object') return false;
  if (candidate.expected === null || typeof candidate.expected !== 'object') return false;
  const format = candidate.format as UnknownRecord;
  const layout = candidate.layout as UnknownRecord;
  const expected = candidate.expected as UnknownRecord;
  if (expected.resourceLimits === null || typeof expected.resourceLimits !== 'object') return false;
  const limits = expected.resourceLimits as UnknownRecord;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.id === 'string' &&
    isDomain(candidate.domain) &&
    typeof format.family === 'string' &&
    typeof layout.entrypoint === 'string' &&
    typeof expected.classification === 'string' &&
    typeof expected.outcome === 'string' &&
    typeof limits.timeoutMs === 'number' &&
    typeof limits.maxInputBytes === 'number' &&
    typeof limits.maxDecodedPixels === 'number' &&
    typeof limits.maxFrames === 'number'
  );
}

function parseWorkerRequest(value: unknown): PureJsImageWorkerRequest {
  const request = record(value, 'worker request');
  if (typeof request.libraryPath !== 'string' || request.libraryPath.length === 0) {
    throw new Error('worker libraryPath is missing');
  }
  if (
    typeof request.materializedDirectory !== 'string' ||
    request.materializedDirectory.length === 0
  ) {
    throw new Error('worker materializedDirectory is missing');
  }
  if (!isCorpusCase(request.corpusCase)) throw new Error('worker corpusCase is invalid');
  return {
    libraryPath: request.libraryPath,
    materializedDirectory: request.materializedDirectory,
    corpusCase: request.corpusCase,
  };
}

function moduleUrl(libraryPath: string, relativePath: string): string {
  return pathToFileURL(join(libraryPath, 'dist', ...relativePath.split('/'))).href;
}

function adapterFor(request: PureJsImageWorkerRequest): PureJsImageAdapter {
  if (request.corpusCase.domain === 'ordinary') return 'codec';
  if (request.corpusCase.domain === 'scientific') return 'scientific';
  if (request.corpusCase.domain === 'geo') return 'geo';
  if (['geozarr', 'image-world-file', 'srtm-hgt'].includes(request.corpusCase.format.family)) {
    return 'geo';
  }
  if (request.corpusCase.format.family === 'meta-image') return 'scientific';
  return 'codec';
}

function entrypoint(request: PureJsImageWorkerRequest): string {
  return join(request.materializedDirectory, ...request.corpusCase.layout.entrypoint.split('/'));
}

function errorResult(
  adapter: PureJsImageAdapter,
  operation: string,
  error: unknown,
  request: PureJsImageWorkerRequest,
): PureJsImageWorkerResult {
  const value = error instanceof Error ? error : new Error(String(error));
  const code = record(value, 'error').code;
  const message = [request.materializedDirectory, request.libraryPath, process.cwd()].reduce(
    (current, localPath) => current.replaceAll(localPath, '[local-path]'),
    value.message,
  );
  return {
    kind: 'error',
    adapter,
    operation,
    error: {
      name: value.name,
      ...(typeof code === 'string' ? { code } : {}),
      message,
    },
  };
}

function jsonSafe(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limit]';
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.startsWith('/')) return `[local-path]/${value.split('/').at(-1) ?? 'resource'}`;
    return value;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.slice(0, 128).map((item) => jsonSafe(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    const output: UnknownRecord = {};
    for (const [key, item] of Object.entries(value).slice(0, 128)) {
      output[key] = jsonSafe(item, depth + 1);
    }
    return output;
  }
  return String(value);
}

function bytesOf(value: unknown, label: string): Uint8Array {
  if (!ArrayBuffer.isView(value)) throw new Error(`${label} is not a typed array`);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

async function runCodec(request: PureJsImageWorkerRequest): Promise<PureJsImageWorkerResult> {
  const adapter = 'codec';
  let operation = 'load-library';
  try {
    const [coreValue, codecsValue, heicValue] = await Promise.all([
      import(moduleUrl(request.libraryPath, 'index.js')),
      import(moduleUrl(request.libraryPath, 'codec-entries/all.js')),
      import(moduleUrl(request.libraryPath, 'codec-entries/experimental/heic.js')),
    ]);
    const core = record(coreValue, 'PureJsImage core module');
    const codecs = record(codecsValue, 'PureJsImage codecs module');
    const heic = record(heicValue, 'PureJsImage HEIC module');
    const allCodecs = arrayValue(codecs.allCodecs, 'allCodecs');
    const experimentalHeifCodec = record(heic.experimentalHeifCodec, 'experimentalHeifCodec');
    const createImageLibrary = callable(core.createImageLibrary, 'createImageLibrary');
    const library = record(
      createImageLibrary([...allCodecs, experimentalHeifCodec]),
      'image library',
    );
    const limits = request.corpusCase.expected.resourceLimits;
    const openImage = async (frame?: number): Promise<UnknownRecord> =>
      record(
        await callable(library.open, 'image library open').call(library, entrypoint(request), {
          tolerantDecoding: false,
          ...(frame === undefined ? {} : { frame }),
          limits: {
            maxInputBytes: Math.max(1, limits.maxInputBytes),
            maxPixels: Math.max(1, limits.maxDecodedPixels),
            maxFrames: Math.max(1, limits.maxFrames),
            maxDecodedBytes: Math.max(1, limits.maxDecodedPixels * 16),
          },
        }),
        'opened image',
      );
    operation = 'open';
    const image = await openImage();
    operation = 'metadata';
    const metadata = await callable(image.metadata, 'image metadata').call(image);
    const safeMetadata = record(jsonSafe(metadata), 'codec metadata');
    const frames =
      typeof safeMetadata.frames === 'number' && Number.isInteger(safeMetadata.frames)
        ? safeMetadata.frames
        : 1;
    if (frames < 1 || frames > limits.maxFrames) {
      throw new Error(`LIMIT_EXCEEDED: Image has ${frames} frames; maximum is ${limits.maxFrames}`);
    }
    operation = 'full-decode-all-frames-to-qoi';
    const hash = createHash('sha256');
    let outputBytes = 0;
    for (let frame = 0; frame < frames; frame += 1) {
      const frameImage = frames === 1 ? image : await openImage(frame);
      const encodedImage = record(
        callable(frameImage.qoi, 'QOI encode').call(frameImage),
        'QOI pipeline',
      );
      const output = bytesOf(
        await callable(encodedImage.toBuffer, 'image toBuffer').call(encodedImage),
        'codec output',
      );
      outputBytes += output.byteLength;
      hash.update(String(output.byteLength));
      hash.update('\0');
      hash.update(output);
    }
    return {
      kind: 'success',
      adapter,
      operation,
      implementation: 'codec-registry',
      outputBytes,
      outputSha256: hash.digest('hex'),
      metadata: { ...safeMetadata, decodedFrames: frames },
    };
  } catch (error: unknown) {
    return errorResult(adapter, operation, error, request);
  }
}

function readersFromModule(value: unknown): Reader[] {
  const readers: Reader[] = [];
  for (const candidate of Object.values(record(value, 'reader module'))) {
    if (candidate === null || typeof candidate !== 'object') continue;
    const item = candidate as UnknownRecord;
    if (typeof item.probe !== 'function' || typeof item.open !== 'function') continue;
    const descriptor = record(item.descriptor, 'reader descriptor');
    readers.push({
      descriptor: {
        ...descriptor,
        id: stringValue(descriptor.id, 'reader id'),
        version: stringValue(descriptor.version, 'reader version'),
      },
      probe: item.probe as Reader['probe'],
      open: item.open as Reader['open'],
    });
  }
  return readers.sort((left, right) => left.descriptor.id.localeCompare(right.descriptor.id));
}

function cartesianIndices(
  axes: Array<{ id: string; length: number }>,
  maxFrames: number,
): Array<Array<{ axisId: string; index: number }>> {
  if (maxFrames < 1) throw new Error('LIMIT_EXCEEDED: Full decode exceeds maxFrames');
  let selections: Array<Array<{ axisId: string; index: number }>> = [[]];
  for (const axis of axes) {
    if (selections.length * axis.length > maxFrames) {
      throw new Error(`LIMIT_EXCEEDED: Full decode exceeds maxFrames ${maxFrames}`);
    }
    selections = selections.flatMap((selection) =>
      Array.from({ length: axis.length }, (_, index) => [...selection, { axisId: axis.id, index }]),
    );
  }
  return selections;
}

function planeRequests(
  descriptorValue: unknown,
  maxFrames: number,
  maxDecodedPixels: number,
): UnknownRecord[] | undefined {
  const descriptor = record(descriptorValue, 'scientific dataset descriptor');
  const axes = arrayValue(descriptor.axes, 'scientific axes').map((value) => {
    const axis = record(value, 'scientific axis');
    return {
      id: stringValue(axis.id, 'scientific axis id'),
      length: numberValue(axis.length, 'scientific axis length'),
      kind: typeof axis.kind === 'string' ? axis.kind : 'other',
    };
  });
  if (axes.length < 2) return undefined;
  const capabilities = record(descriptor.capabilities, 'scientific capabilities');
  const planeReads = record(capabilities.planeReads, 'scientific plane capability');
  if (planeReads.kind === 'none') return undefined;
  let displayAxes: readonly [string, string] | undefined;
  if (planeReads.kind === 'ordered-axis-pairs') {
    const first = arrayValue(planeReads.pairs, 'scientific axis pairs')[0];
    if (Array.isArray(first) && first.length === 2) {
      displayAxes = [
        stringValue(first[0], 'horizontal scientific axis'),
        stringValue(first[1], 'vertical scientific axis'),
      ];
    }
  }
  if (displayAxes === undefined) {
    const spatial = axes.filter((axis) => axis.kind === 'space');
    const selected = spatial.length >= 2 ? spatial : axes;
    const horizontal = selected[0];
    const vertical = selected[1];
    if (!horizontal || !vertical) return undefined;
    displayAxes = [horizontal.id, vertical.id];
  }
  const horizontal = axes.find((axis) => axis.id === displayAxes[0]);
  const vertical = axes.find((axis) => axis.id === displayAxes[1]);
  if (!horizontal || !vertical) return undefined;
  const width = horizontal.length;
  const height = vertical.length;
  const fixedSelections = cartesianIndices(
    axes.filter((axis) => !displayAxes.includes(axis.id)),
    maxFrames,
  );
  if (width * height * fixedSelections.length > maxDecodedPixels) {
    throw new Error(`LIMIT_EXCEEDED: Full decode exceeds maxDecodedPixels ${maxDecodedPixels}`);
  }
  return fixedSelections.map((fixedIndices) => ({
    displayAxes,
    fixedIndices,
    x: 0,
    y: 0,
    width,
    height,
  }));
}

async function decodeScientificDataset(
  datasetValue: unknown,
  maxFrames: number,
  maxDecodedPixels: number,
): Promise<{
  bytes: number;
  sha256?: string;
  operation: string;
  frames: number;
  pixels: number;
}> {
  const dataset = record(datasetValue, 'scientific dataset');
  const requests = planeRequests(dataset.descriptor, maxFrames, maxDecodedPixels);
  if (requests === undefined) {
    return { bytes: 0, operation: 'metadata-only', frames: 0, pixels: 0 };
  }
  const hash = createHash('sha256');
  let bytes = 0;
  let pixels = 0;
  for (const request of requests) {
    const iterable = await callable(dataset.readPlane, 'scientific readPlane').call(
      dataset,
      request,
    );
    if (iterable === null || typeof iterable !== 'object' || !(Symbol.asyncIterator in iterable)) {
      throw new Error('scientific readPlane did not return an async iterable');
    }
    pixels +=
      numberValue(request.width, 'scientific plane width') *
      numberValue(request.height, 'scientific plane height');
    for await (const blockValue of iterable as AsyncIterable<unknown>) {
      const block = record(blockValue, 'scientific raster block');
      const data = bytesOf(block.data, 'scientific raster block data');
      bytes += data.byteLength;
      hash.update(data);
      if (typeof block.release === 'function') block.release();
    }
  }
  return {
    bytes,
    sha256: hash.digest('hex'),
    operation: 'metadata+full-decode',
    frames: requests.length,
    pixels,
  };
}

async function runScientific(request: PureJsImageWorkerRequest): Promise<PureJsImageWorkerResult> {
  const adapter = 'scientific';
  let operation = 'load-library';
  try {
    const [scientificValue, nodeValue, readersValue] = await Promise.all([
      import(moduleUrl(request.libraryPath, 'scientific/index.js')),
      import(moduleUrl(request.libraryPath, 'scientific/node.js')),
      import(moduleUrl(request.libraryPath, 'scientific/readers/all.js')),
    ]);
    const scientific = record(scientificValue, 'scientific module');
    const node = record(nodeValue, 'scientific Node module');
    const readers = readersFromModule(readersValue);
    const library = record(
      callable(scientific.createScientificLibrary, 'createScientificLibrary')({ readers }),
      'scientific library',
    );
    operation = 'open';
    const maxInputBytes = Math.max(1, request.corpusCase.expected.resourceLimits.maxInputBytes);
    const context = await callable(node.createScientificPathContext, 'createScientificPathContext')(
      entrypoint(request),
      {
        id: request.corpusCase.id,
        probeLimits: {
          maxReadBytes: maxInputBytes,
          maxTotalBytes: Math.min(
            Number.MAX_SAFE_INTEGER,
            maxInputBytes * Math.max(1, readers.length),
          ),
          maxTotalReads: 512,
          maxReaders: Math.max(1, readers.length),
          maxCompanionResolutions: Math.max(32, request.corpusCase.assets.length * 4),
        },
      },
    );
    const document = record(
      await callable(library.open, 'scientific library open').call(library, context),
      'scientific document',
    );
    const reader = record(document.reader, 'scientific document reader');
    const summaries = arrayValue(document.datasets, 'scientific dataset summaries');
    const hash = createHash('sha256');
    let outputBytes = 0;
    let decodedDatasets = 0;
    let decodedFrames = 0;
    let decodedPixels = 0;
    operation = 'metadata+full-decode';
    for (const summaryValue of summaries.slice(
      0,
      request.corpusCase.expected.resourceLimits.maxFrames,
    )) {
      const summary = record(summaryValue, 'scientific dataset summary');
      const id = stringValue(summary.id, 'scientific dataset id');
      const dataset = await callable(document.openDataset, 'open scientific dataset').call(
        document,
        id,
      );
      const sample = await decodeScientificDataset(
        dataset,
        request.corpusCase.expected.resourceLimits.maxFrames - decodedFrames,
        request.corpusCase.expected.resourceLimits.maxDecodedPixels - decodedPixels,
      );
      outputBytes += sample.bytes;
      decodedFrames += sample.frames;
      decodedPixels += sample.pixels;
      if (sample.sha256) hash.update(sample.sha256);
      if (sample.operation !== 'metadata-only') decodedDatasets += 1;
    }
    if (typeof document.close === 'function') await document.close();
    return {
      kind: 'success',
      adapter,
      operation,
      implementation: `${stringValue(reader.id, 'scientific reader id')}@${stringValue(reader.version, 'scientific reader version')}`,
      outputBytes,
      ...(outputBytes > 0 ? { outputSha256: hash.digest('hex') } : {}),
      metadata: {
        format: jsonSafe(document.format),
        datasetCount: summaries.length,
        decodedDatasets,
        decodedFrames,
        decodedPixels,
        documentMetadata: jsonSafe(document.metadata),
      },
    };
  } catch (error: unknown) {
    return errorResult(adapter, operation, error, request);
  }
}

async function selectGeoReader(readers: Reader[], context: unknown): Promise<Reader> {
  const results: Array<{ reader: Reader; confidence: number }> = [];
  for (const reader of readers) {
    try {
      const result = await reader.probe(context);
      if (result.confidence > 0) results.push({ reader, confidence: result.confidence });
    } catch {
      // A strict probe may reject bytes belonging to another reader. Only a positive probe matches.
    }
  }
  const top = Math.max(0, ...results.map((item) => item.confidence));
  const matches = results.filter((item) => item.confidence === top);
  if (matches.length === 0)
    throw new Error('UNSUPPORTED_FORMAT: No geo reader matched the resource');
  if (matches.length > 1) {
    throw new Error(
      `UNSUPPORTED_FORMAT: Geo reader detection is ambiguous: ${matches.map((item) => item.reader.descriptor.id).join(', ')}`,
    );
  }
  const match = matches[0];
  if (!match) throw new Error('UNSUPPORTED_FORMAT: No geo reader matched the resource');
  return match.reader;
}

async function decodeGeoDataset(
  datasetValue: unknown,
  maxFrames: number,
  maxDecodedPixels: number,
): Promise<{ bytes: number; sha256: string; frames: number; pixels: number }> {
  const dataset = record(datasetValue, 'geo dataset');
  const descriptor = record(dataset.descriptor, 'geo dataset descriptor');
  const spatial = record(descriptor.spatialDimensions, 'geo spatial dimensions');
  const x = record(spatial.x, 'geo x dimension');
  const y = record(spatial.y, 'geo y dimension');
  const axes = arrayValue(descriptor.axes, 'geo axes');
  const levels = arrayValue(descriptor.levels, 'geo levels');
  const primaryLevelId = stringValue(descriptor.primaryLevelId, 'geo primary level id');
  const level = levels
    .map((value) => record(value, 'geo level'))
    .find((value) => value.id === primaryLevelId);
  if (!level) throw new Error(`Geo primary level is missing: ${primaryLevelId}`);
  const bands = arrayValue(descriptor.bands, 'geo bands');
  const width = numberValue(level.width, 'geo level width');
  const height = numberValue(level.height, 'geo level height');
  const normalizedAxes = axes.map((value) => {
    const axis = record(value, 'geo axis');
    return {
      id: stringValue(axis.id, 'geo axis id'),
      length: numberValue(axis.length, 'geo axis length'),
    };
  });
  const selections = cartesianIndices(normalizedAxes, maxFrames);
  if (width * height * selections.length > maxDecodedPixels) {
    throw new Error(`LIMIT_EXCEEDED: Full decode exceeds maxDecodedPixels ${maxDecodedPixels}`);
  }
  const spatialDimensions = [stringValue(x.id, 'geo x id'), stringValue(y.id, 'geo y id')];
  const sourceBands = bands.map((_, index) => index);
  const hash = createHash('sha256');
  let bytes = 0;
  for (const selection of selections) {
    const view = record(
      callable(dataset.createView, 'geo createView').call(dataset, {
        spatialDimensions,
        nonSpatial: selection.map(({ axisId, index }) => ({
          kind: 'index',
          axisId,
          index,
        })),
        sourceBands,
        levelId: primaryLevelId,
      }),
      'geo view',
    );
    const iterable = await callable(view.readPixelRegion, 'geo readPixelRegion').call(view, {
      region: { x: 0, y: 0, width, height },
    });
    if (iterable === null || typeof iterable !== 'object' || !(Symbol.asyncIterator in iterable)) {
      throw new Error('geo readPixelRegion did not return an async iterable');
    }
    for await (const tileValue of iterable as AsyncIterable<unknown>) {
      const tile = record(tileValue, 'geo tile');
      const data = bytesOf(tile.data, 'geo tile data');
      bytes += data.byteLength;
      hash.update(data);
      if (typeof tile.release === 'function') tile.release();
    }
  }
  return {
    bytes,
    sha256: hash.digest('hex'),
    frames: selections.length,
    pixels: width * height * selections.length,
  };
}

async function runGeo(request: PureJsImageWorkerRequest): Promise<PureJsImageWorkerResult> {
  const adapter = 'geo';
  let operation = 'load-library';
  try {
    const [nodeValue, readersValue] = await Promise.all([
      import(moduleUrl(request.libraryPath, 'scientific/node.js')),
      import(moduleUrl(request.libraryPath, 'geo/readers/all.js')),
    ]);
    const node = record(nodeValue, 'scientific Node module');
    const readersModule = record(readersValue, 'geo readers module');
    const readers = arrayValue(readersModule.geoReaders, 'geoReaders').map((value) => {
      const item = record(value, 'geo reader');
      const descriptor = record(item.descriptor, 'geo reader descriptor');
      return {
        descriptor: {
          ...descriptor,
          id: stringValue(descriptor.id, 'geo reader id'),
          version: stringValue(descriptor.version, 'geo reader version'),
        },
        probe: callable(item.probe, 'geo reader probe') as Reader['probe'],
        open: callable(item.open, 'geo reader open') as Reader['open'],
      };
    });
    const context = await callable(node.createScientificPathContext, 'createScientificPathContext')(
      entrypoint(request),
      { id: request.corpusCase.id },
    );
    operation = 'probe';
    const reader = await selectGeoReader(readers, context);
    operation = 'open';
    const document = record(await reader.open(context), 'geo document');
    const summaries = arrayValue(document.datasets, 'geo dataset summaries');
    const hash = createHash('sha256');
    let outputBytes = 0;
    let decodedDatasets = 0;
    let decodedFrames = 0;
    let decodedPixels = 0;
    operation = 'metadata+full-decode';
    for (const summaryValue of summaries.slice(
      0,
      request.corpusCase.expected.resourceLimits.maxFrames,
    )) {
      const summary = record(summaryValue, 'geo dataset summary');
      const dataset = await callable(document.openDataset, 'open geo dataset').call(
        document,
        stringValue(summary.id, 'geo dataset id'),
      );
      const sample = await decodeGeoDataset(
        dataset,
        request.corpusCase.expected.resourceLimits.maxFrames - decodedFrames,
        request.corpusCase.expected.resourceLimits.maxDecodedPixels - decodedPixels,
      );
      outputBytes += sample.bytes;
      decodedFrames += sample.frames;
      decodedPixels += sample.pixels;
      hash.update(sample.sha256);
      decodedDatasets += 1;
    }
    if (typeof document.close === 'function') await document.close();
    return {
      kind: 'success',
      adapter,
      operation,
      implementation: `${reader.descriptor.id}@${reader.descriptor.version}`,
      outputBytes,
      ...(outputBytes > 0 ? { outputSha256: hash.digest('hex') } : {}),
      metadata: {
        format: jsonSafe(document.format),
        datasetCount: summaries.length,
        decodedDatasets,
        decodedFrames,
        decodedPixels,
        documentMetadata: jsonSafe(document.metadata),
      },
    };
  } catch (error: unknown) {
    return errorResult(adapter, operation, error, request);
  }
}

export async function runWorker(
  request: PureJsImageWorkerRequest,
): Promise<PureJsImageWorkerResult> {
  const adapter = adapterFor(request);
  if (adapter === 'codec') return runCodec(request);
  if (adapter === 'scientific') return runScientific(request);
  return runGeo(request);
}

const encoded = process.argv[2];
if (!encoded) throw new Error('PureJsImage worker request is missing');
const request = parseWorkerRequest(
  JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown,
);
const output = await runWorker(request);
if (process.send) {
  await new Promise<void>((resolveSend, rejectSend) => {
    process.send?.(output, (error) => {
      if (error) rejectSend(error);
      else resolveSend();
    });
  });
  process.disconnect?.();
} else {
  await new Promise<void>((resolveWrite, rejectWrite) => {
    process.stdout.write(`${JSON.stringify(output)}\n`, (error) => {
      if (error) rejectWrite(error);
      else resolveWrite();
    });
  });
}
