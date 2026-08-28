export type Domain = 'ordinary' | 'scientific' | 'geo' | 'negative';
export type StorageMode = 'vendored' | 'external' | 'generated';
export type LayoutKind =
  | 'single-file'
  | 'companion-set'
  | 'multi-file'
  | 'directory-tree'
  | 'archive';

export interface SourceRecord {
  schemaVersion: 1;
  id: string;
  project: string;
  homepage: string;
  sourceType:
    | 'github-repository'
    | 'github-tree'
    | 'http-file'
    | 'http-index'
    | 'archive'
    | 'object-tree'
    | 'generated';
  trackingRef?: string;
  pinnedRevision: string;
  evidence: { sourceUrls: string[]; licenseUrls: string[] };
  defaultRedistribution: 'allowed' | 'download-only' | 'unknown' | 'forbidden';
  expectedStability: 'immutable' | 'release' | 'repository' | 'unstable';
  updatePolicy: string;
  notes: string[];
}

export interface CaseAsset {
  path: string;
  role:
    | 'primary'
    | 'header'
    | 'payload'
    | 'sidecar'
    | 'world-file'
    | 'directory-object'
    | 'archive'
    | 'label'
    | 'expected-output';
  storage: StorageMode;
  sourceId: string;
  sourcePath?: string;
  resolvedUrl?: string;
  mirrors?: string[];
  bytes: number;
  sha256: string;
  mediaType?: string;
  derivedFrom?: string;
}

export interface CorpusCase {
  schemaVersion: 1;
  id: string;
  caseRevision: number;
  title: string;
  description: string;
  domain: Domain;
  format: {
    family: string;
    container?: string;
    dialect?: string;
    profile?: string;
    level?: string;
    embeddedCodecs?: string[];
    extensions: string[];
    mediaTypes: string[];
    features: string[];
  };
  layout: { kind: LayoutKind; entrypoint: string; requiredPaths: string[] };
  assets: CaseAsset[];
  provenance: {
    sourceId: string;
    originalUrl: string;
    resolvedAt: string;
    method: 'migrated' | 'downloaded' | 'generated' | 'mutated' | 'indexed';
    parentSha256?: string;
  };
  rights: {
    spdx?: string;
    licenseName: string;
    evidenceUrl: string;
    attribution: string;
    redistribution: 'allowed' | 'download-only' | 'unknown' | 'forbidden';
  };
  privacy: {
    reviewStatus: 'passed' | 'not-required' | 'pending' | 'failed';
    containsHumanData: boolean;
    phi: 'none' | 'unknown' | 'present';
    burnedInText: 'none' | 'unknown' | 'present';
    gps: 'none' | 'unknown' | 'present';
    faces: 'none' | 'unknown' | 'present';
    deidentified: 'yes' | 'no' | 'unknown' | 'not-applicable';
    notes: string[];
  };
  certification: {
    status:
      | 'uncertified'
      | 'generator-reviewed'
      | 'single-oracle'
      | 'multi-oracle'
      | 'upstream-conformance-vector'
      | 'spec-derived';
    evidence: Array<{
      implementation: string;
      version: string;
      containerDigest?: string;
      operation: string;
      result: 'success' | 'reject' | 'implementation-defined';
      canonicalOutputSha256?: string;
      notes?: string;
    }>;
  };
  expected: {
    classification: 'valid' | 'invalid' | 'nonconformant' | 'crash-regression';
    outcome: 'success' | 'reject' | 'implementation-defined';
    operations: Array<
      | 'metadata'
      | 'thumbnail'
      | 'first-frame'
      | 'all-frames'
      | 'full-decode'
      | 'region-read'
      | 'range-read'
    >;
    comparison:
      | { method: 'structural' }
      | {
          method: 'exact';
          canonical: 'rgba8-decoder-v1' | 'rgba8-srgb-v1' | 'ndarray-v1' | 'metadata-json-v1';
          sha256: string;
        }
      | {
          method: 'tolerance';
          maxAbsoluteError: number;
          rmse: number;
          channelTolerance?: number[];
          alphaExact: boolean;
        };
    metadata: Record<string, string | number | boolean | null>;
    error?: {
      allowedOperations: string[];
      allowedCodes: string[];
      mustRecognizeFormat: boolean;
      messageIncludes: string[];
    };
    resourceLimits: {
      timeoutMs: number;
      maxInputBytes: number;
      maxDecodedPixels: number;
      maxFrames: number;
      maxHeapMiB: number;
    };
  };
  coverage: {
    features: string[];
    selectionReason: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    redundancyGroup?: string;
  };
  relationships?: Array<{
    type:
      | 'parent'
      | 'derivative-of'
      | 'mutated-from'
      | 'equivalent-encoding'
      | 'compressed-version-of'
      | 'supersedes'
      | 'alias';
    caseId: string;
  }>;
  notes: string[];
}

export interface Selector {
  domain?: Domain;
  formatFamily?: string;
  layoutKind?: LayoutKind;
  classification?: CorpusCase['expected']['classification'];
  feature?: string;
  storage?: StorageMode;
}

export interface CollectionRecord {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  intendedUse: string;
  networkPolicy: 'offline' | 'optional' | 'required';
  maximumVendoredBytes: number;
  caseIds: string[];
  selectors: Selector[];
  exclusions: string[];
}

export interface Catalog {
  sources: SourceRecord[];
  cases: CorpusCase[];
  collections: CollectionRecord[];
  features: string[];
  formats: string[];
}
