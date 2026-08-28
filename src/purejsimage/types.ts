import type { CorpusCase } from '../catalog/types.js';

export type PureJsImageAdapter = 'codec' | 'scientific' | 'geo';
export type PureJsImageVerdict =
  | 'pass'
  | 'fail'
  | 'unsupported'
  | 'timeout'
  | 'crash'
  | 'unavailable';

export interface PureJsImageError {
  name: string;
  code?: string;
  message: string;
}

export interface PureJsImageWorkerSuccess {
  kind: 'success';
  adapter: PureJsImageAdapter;
  operation: string;
  executedOperations: CorpusCase['expected']['operations'];
  implementation: string;
  outputBytes: number;
  outputSha256?: string;
  canonical?: 'rgba8-decoder-v1' | 'rgba8-srgb-v1' | 'ndarray-v1';
  metadata: Record<string, unknown>;
}

export interface PureJsImageWorkerError {
  kind: 'error';
  adapter: PureJsImageAdapter;
  operation: string;
  error: PureJsImageError;
}

export type PureJsImageWorkerResult = PureJsImageWorkerSuccess | PureJsImageWorkerError;

export interface PureJsImageCaseResult {
  caseId: string;
  domain: CorpusCase['domain'];
  format: string;
  classification: CorpusCase['expected']['classification'];
  expectedOutcome: CorpusCase['expected']['outcome'];
  verdict: PureJsImageVerdict;
  durationMs: number;
  expectationFailures?: string[];
  worker?: PureJsImageWorkerResult;
  error?: PureJsImageError;
}

export interface PureJsImageLibraryIdentity {
  packageName: string;
  version: string;
  gitRevision?: string;
  gitDirty?: boolean;
  distSha256: string;
}

export interface PureJsImageCorpusReport {
  schemaVersion: 1;
  startedAt: string;
  finishedAt: string;
  library: PureJsImageLibraryIdentity;
  execution: {
    isolation: 'child-process-per-case';
    codec: 'metadata+canonical-rgba8-frame-decode';
    scientific: 'metadata+full-plane-decode';
    geo: 'metadata+full-primary-resolution-decode';
    minimumTimeoutMs: number;
    timeoutGraceMs: number;
    minimumHeapMiB: number;
  };
  selection: { kind: 'all' | 'collection' | 'case'; value?: string };
  summary: {
    total: number;
    pass: number;
    fail: number;
    unsupported: number;
    timeout: number;
    crash: number;
    unavailable: number;
    durationMs: number;
  };
  results: PureJsImageCaseResult[];
}

export interface PureJsImageWorkerRequest {
  libraryPath: string;
  materializedDirectory: string;
  corpusCase: CorpusCase;
}
