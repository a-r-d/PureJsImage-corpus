import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../src/catalog/load.js';
import type { CorpusCase } from '../src/catalog/types.js';
import {
  renderPureJsImageReport,
  summarizeResults,
  verdictFor,
} from '../src/purejsimage/report.js';
import type {
  PureJsImageCaseResult,
  PureJsImageCorpusReport,
  PureJsImageWorkerResult,
} from '../src/purejsimage/types.js';

function caseById(cases: CorpusCase[], id: string): CorpusCase {
  const corpusCase = cases.find((candidate) => candidate.id === id);
  if (!corpusCase) throw new Error(`Test case is missing: ${id}`);
  return corpusCase;
}

const success: PureJsImageWorkerResult = {
  kind: 'success',
  adapter: 'codec',
  operation: 'full-decode-all-frames-to-canonical-rgba8',
  executedOperations: ['metadata', 'full-decode'],
  implementation: 'qoi@1',
  outputBytes: 34,
  metadata: { width: 2, height: 2 },
};

function workerError(message: string, code?: string, operation = 'open'): PureJsImageWorkerResult {
  return {
    kind: 'error',
    adapter: 'codec',
    operation,
    error: { name: 'ImageError', ...(code ? { code } : {}), message },
  };
}

describe('PureJsImage corpus reporting', () => {
  it('keeps valid, expected-rejection, and unsupported outcomes distinct', async () => {
    const { cases } = await loadCatalog();
    const valid = caseById(cases, 'ordinary/qoi/rgba-2x2');
    const invalid = caseById(cases, 'negative/qoi/truncated-header');
    const invalidMagic = caseById(cases, 'negative/qoi/invalid-magic');

    expect(verdictFor(valid, success)).toBe('pass');
    expect(verdictFor(valid, workerError('bad input', 'INVALID_INPUT'))).toBe('fail');
    expect(
      verdictFor(invalid, workerError('QOI header is truncated', 'TRUNCATED_INPUT', 'metadata')),
    ).toBe('pass');
    expect(verdictFor(invalid, workerError('No codec matched', 'UNSUPPORTED_FORMAT'))).toBe('fail');
    expect(
      verdictFor(invalidMagic, workerError('Input format is not recognized', 'UNSUPPORTED_FORMAT')),
    ).toBe('pass');
    expect(verdictFor(invalid, success)).toBe('fail');
    expect(verdictFor(valid, workerError('No codec matched', 'UNSUPPORTED_FORMAT'))).toBe(
      'unsupported',
    );

    const wrongMetadata = structuredClone(valid);
    wrongMetadata.expected.metadata = { width: 3 };
    expect(verdictFor(wrongMetadata, success)).toBe('fail');
  });

  it('renders build identity, per-format counts, and per-case evidence', () => {
    const results: PureJsImageCaseResult[] = [
      {
        caseId: 'ordinary/qoi/rgba-2x2',
        domain: 'ordinary',
        format: 'qoi',
        classification: 'valid',
        expectedOutcome: 'success',
        verdict: 'pass',
        durationMs: 12,
        worker: success,
      },
      {
        caseId: 'ordinary/png/example',
        domain: 'ordinary',
        format: 'png',
        classification: 'valid',
        expectedOutcome: 'success',
        verdict: 'unsupported',
        durationMs: 4,
        worker: workerError('No codec matched', 'UNSUPPORTED_FORMAT'),
      },
    ];
    const report: PureJsImageCorpusReport = {
      schemaVersion: 1,
      startedAt: '2026-08-28T00:00:00.000Z',
      finishedAt: '2026-08-28T00:00:01.000Z',
      library: {
        packageName: 'purejsimage',
        version: '0.17.0',
        gitRevision: '0123456789abcdef',
        gitDirty: true,
        distSha256: 'a'.repeat(64),
      },
      execution: {
        isolation: 'child-process-per-case',
        codec: 'metadata+canonical-rgba8-frame-decode',
        scientific: 'metadata+full-plane-decode',
        geo: 'metadata+full-primary-resolution-decode',
        minimumTimeoutMs: 5_000,
        timeoutGraceMs: 2_000,
        minimumHeapMiB: 64,
      },
      selection: { kind: 'all' },
      summary: summarizeResults(results, 1_000),
      results,
    };

    const markdown = renderPureJsImageReport(report);
    expect(markdown).toContain('dirty source checkout');
    expect(markdown).toContain('Scientific cases: metadata+full-plane-decode');
    expect(markdown).toContain(`Executed dist SHA-256: \`${'a'.repeat(64)}\``);
    expect(markdown).toContain('| `png` | 1 | 0 | 0 | 1 |');
    expect(markdown).toContain('| `qoi` | 1 | 1 | 0 | 0 |');
    expect(markdown).toContain('`ordinary/qoi/rgba-2x2`');
    expect(markdown).toContain('`unsupported` is reported separately from failure');
  });
});
