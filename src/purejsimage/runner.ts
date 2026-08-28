import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import type { CorpusCase } from '../catalog/types.js';
import { materializeCase } from '../materialize/index.js';
import { renderPureJsImageReport, summarizeResults, verdictFor } from './report.js';
import type {
  PureJsImageCaseResult,
  PureJsImageCorpusReport,
  PureJsImageError,
  PureJsImageLibraryIdentity,
  PureJsImageWorkerRequest,
  PureJsImageWorkerResult,
} from './types.js';

export interface RunPureJsImageOptions {
  root: string;
  cacheRoot: string;
  libraryPath: string;
  cases: CorpusCase[];
  offline: boolean;
  outputBase: string;
  selection: PureJsImageCorpusReport['selection'];
  onProgress?: (completed: number, total: number, result: PureJsImageCaseResult) => void;
}

interface ChildResult {
  kind: 'result' | 'timeout' | 'crash';
  worker?: PureJsImageWorkerResult;
  error?: PureJsImageError;
}

function errorValue(error: unknown): PureJsImageError {
  const value = error instanceof Error ? error : new Error(String(error));
  const code = (value as Error & { code?: unknown }).code;
  const message = value.message.replace(/\/(?:home|media|tmp)\/[^\s:;,)]+/g, '[local-path]');
  return {
    name: value.name,
    ...(typeof code === 'string' ? { code } : {}),
    message,
  };
}

function isWorkerResult(value: unknown): value is PureJsImageWorkerResult {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const validAdapter =
    candidate.adapter === 'codec' ||
    candidate.adapter === 'scientific' ||
    candidate.adapter === 'geo';
  if (candidate.kind === 'success') {
    return (
      validAdapter &&
      typeof candidate.operation === 'string' &&
      typeof candidate.implementation === 'string' &&
      typeof candidate.outputBytes === 'number' &&
      Number.isFinite(candidate.outputBytes) &&
      candidate.metadata !== null &&
      typeof candidate.metadata === 'object'
    );
  }
  if (
    candidate.kind !== 'error' ||
    candidate.error === null ||
    typeof candidate.error !== 'object'
  ) {
    return false;
  }
  const error = candidate.error as Record<string, unknown>;
  return (
    validAdapter &&
    typeof candidate.operation === 'string' &&
    typeof error.name === 'string' &&
    typeof error.message === 'string'
  );
}

function workerProcess(
  request: PureJsImageWorkerRequest,
  root: string,
  timeoutMs: number,
): Promise<ChildResult> {
  return new Promise((resolveResult) => {
    const encoded = Buffer.from(JSON.stringify(request)).toString('base64url');
    const heapMiB = Math.max(64, Math.floor(request.corpusCase.expected.resourceLimits.maxHeapMiB));
    const child = spawn(
      process.execPath,
      [
        `--max-old-space-size=${heapMiB}`,
        '--import',
        'tsx',
        join(root, 'src/purejsimage/worker.ts'),
        encoded,
      ],
      { cwd: root, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
    );
    let stderr = '';
    let message: unknown;
    let timedOut = false;
    let settled = false;
    const finish = (result: ChildResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-64_000);
    });
    child.on('message', (value: unknown) => {
      message = value;
    });
    child.on('error', (error) => finish({ kind: 'crash', error: errorValue(error) }));
    child.on('close', (code, signal) => {
      if (timedOut) {
        finish({
          kind: 'timeout',
          error: { name: 'TimeoutError', message: `Worker exceeded ${timeoutMs} ms` },
        });
        return;
      }
      if (code !== 0) {
        finish({
          kind: 'crash',
          error: {
            name: 'WorkerCrash',
            message: `Worker exited with code ${String(code)} signal ${signal ?? 'none'}${stderr ? `: ${stderr.trim()}` : ''}`,
          },
        });
        return;
      }
      try {
        if (!isWorkerResult(message)) throw new Error('Worker returned an invalid result');
        finish({ kind: 'result', worker: message });
      } catch (error: unknown) {
        finish({
          kind: 'crash',
          error: errorValue(
            new Error(
              `Could not read worker result: ${errorValue(error).message}${stderr ? `; stderr: ${stderr.trim()}` : ''}`,
            ),
          ),
        });
      }
    });
  });
}

async function gitOutput(libraryPath: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolveOutput) => {
    const child = spawn('git', ['-C', libraryPath, ...args], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('error', () => resolveOutput(undefined));
    child.on('close', (code) => resolveOutput(code === 0 ? stdout.trim() : undefined));
  });
}

async function filesRecursively(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await filesRecursively(path)));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

export async function identifyPureJsImageLibrary(
  inputPath: string,
): Promise<PureJsImageLibraryIdentity> {
  const path = resolve(inputPath);
  const packageDocument = JSON.parse(await readFile(join(path, 'package.json'), 'utf8')) as unknown;
  if (packageDocument === null || typeof packageDocument !== 'object') {
    throw new Error('PureJsImage package.json is invalid');
  }
  const packageRecord = packageDocument as Record<string, unknown>;
  const packageName = packageRecord.name;
  const version = packageRecord.version;
  if (typeof packageName !== 'string' || packageName.length === 0) {
    throw new Error('PureJsImage package name is missing');
  }
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('PureJsImage package version is missing');
  }
  const dist = join(path, 'dist');
  const hash = createHash('sha256');
  for (const file of await filesRecursively(dist)) {
    hash.update(relative(dist, file));
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  const [gitRevision, gitStatus] = await Promise.all([
    gitOutput(path, ['rev-parse', 'HEAD']),
    gitOutput(path, ['status', '--porcelain']),
  ]);
  return {
    packageName,
    version,
    ...(gitRevision ? { gitRevision } : {}),
    ...(gitStatus !== undefined ? { gitDirty: gitStatus.length > 0 } : {}),
    distSha256: hash.digest('hex'),
  };
}

async function runCase(
  corpusCase: CorpusCase,
  options: RunPureJsImageOptions,
): Promise<PureJsImageCaseResult> {
  const started = performance.now();
  let materializedDirectory: string;
  try {
    materializedDirectory = await materializeCase(corpusCase, {
      root: options.root,
      cacheRoot: options.cacheRoot,
      offline: options.offline,
    });
  } catch (error: unknown) {
    return {
      caseId: corpusCase.id,
      domain: corpusCase.domain,
      format: corpusCase.format.family,
      classification: corpusCase.expected.classification,
      expectedOutcome: corpusCase.expected.outcome,
      verdict: 'unavailable',
      durationMs: Math.round(performance.now() - started),
      error: errorValue(error),
    };
  }
  const child = await workerProcess(
    { libraryPath: resolve(options.libraryPath), materializedDirectory, corpusCase },
    options.root,
    Math.max(5_000, corpusCase.expected.resourceLimits.timeoutMs + 2_000),
  );
  const base = {
    caseId: corpusCase.id,
    domain: corpusCase.domain,
    format: corpusCase.format.family,
    classification: corpusCase.expected.classification,
    expectedOutcome: corpusCase.expected.outcome,
    durationMs: Math.round(performance.now() - started),
  };
  if (child.kind === 'timeout') {
    return {
      ...base,
      verdict: 'timeout',
      error: child.error ?? {
        name: 'TimeoutError',
        message: 'Worker exceeded its case timeout',
      },
    };
  }
  if (child.kind === 'crash') {
    return {
      ...base,
      verdict: 'crash',
      error: child.error ?? {
        name: 'WorkerCrash',
        message: 'Worker exited without a result',
      },
    };
  }
  if (!child.worker) {
    return {
      ...base,
      verdict: 'crash',
      error: { name: 'WorkerCrash', message: 'Worker result is missing' },
    };
  }
  return { ...base, verdict: verdictFor(corpusCase, child.worker), worker: child.worker };
}

export async function runPureJsImageCorpus(
  options: RunPureJsImageOptions,
): Promise<PureJsImageCorpusReport> {
  const startedAt = new Date();
  const library = await identifyPureJsImageLibrary(options.libraryPath);
  const results: PureJsImageCaseResult[] = [];
  for (const corpusCase of options.cases) {
    const result = await runCase(corpusCase, options);
    results.push(result);
    options.onProgress?.(results.length, options.cases.length, result);
  }
  const finishedAt = new Date();
  const report: PureJsImageCorpusReport = {
    schemaVersion: 1,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    library,
    execution: {
      isolation: 'child-process-per-case',
      codec: 'metadata+full-frame-decode-to-qoi',
      scientific: 'metadata+full-plane-decode',
      geo: 'metadata+full-primary-resolution-decode',
      minimumTimeoutMs: 5_000,
      timeoutGraceMs: 2_000,
      minimumHeapMiB: 64,
    },
    selection: options.selection,
    summary: summarizeResults(results, finishedAt.getTime() - startedAt.getTime()),
    results,
  };
  const outputBase = resolve(options.outputBase);
  await mkdir(dirname(outputBase), { recursive: true });
  await Promise.all([
    writeFile(`${outputBase}.json`, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(`${outputBase}.md`, renderPureJsImageReport(report)),
  ]);
  return report;
}
