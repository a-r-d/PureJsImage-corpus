import type {
  PureJsImageCaseResult,
  PureJsImageCorpusReport,
  PureJsImageVerdict,
  PureJsImageWorkerResult,
} from './types.js';
import type { CorpusCase } from '../catalog/types.js';

const verdictOrder: readonly PureJsImageVerdict[] = [
  'pass',
  'fail',
  'unsupported',
  'timeout',
  'crash',
  'unavailable',
];

function isUnsupported(worker: PureJsImageWorkerResult): boolean {
  if (worker.kind !== 'error') return false;
  return (
    worker.error.code === 'UNSUPPORTED_FORMAT' ||
    worker.error.code === 'UNSUPPORTED_OPERATION' ||
    /unsupported|no .*reader matched|no .*codec matched/i.test(worker.error.message)
  );
}

export interface ExpectationEvaluation {
  verdict: PureJsImageVerdict;
  failures: string[];
}

export function evaluateResult(
  corpusCase: CorpusCase,
  worker: PureJsImageWorkerResult,
): ExpectationEvaluation {
  if (worker.kind === 'error') {
    if (corpusCase.expected.outcome === 'implementation-defined') {
      return { verdict: 'pass', failures: [] };
    }
    if (corpusCase.expected.outcome !== 'reject') {
      return { verdict: isUnsupported(worker) ? 'unsupported' : 'fail', failures: [] };
    }
    const contract = corpusCase.expected.error;
    if (!contract) {
      return { verdict: 'fail', failures: ['Expected rejection has no error contract'] };
    }
    const failures: string[] = [];
    if (contract.mustRecognizeFormat && isUnsupported(worker)) {
      failures.push('Reader did not recognize the expected format');
    }
    if (!contract.allowedOperations.includes(worker.operation)) {
      failures.push(`Error occurred during unexpected operation ${worker.operation}`);
    }
    if (!worker.error.code || !contract.allowedCodes.includes(worker.error.code)) {
      failures.push(`Unexpected error code ${worker.error.code ?? '(missing)'}`);
    }
    const message = worker.error.message.toLowerCase();
    for (const expectedText of contract.messageIncludes) {
      if (!message.includes(expectedText.toLowerCase())) {
        failures.push(`Error message does not identify ${expectedText}`);
      }
    }
    return { verdict: failures.length === 0 ? 'pass' : 'fail', failures };
  }

  if (corpusCase.expected.outcome === 'reject') {
    return { verdict: 'fail', failures: ['Expected rejection, but decoding succeeded'] };
  }
  if (corpusCase.expected.outcome === 'implementation-defined') {
    return { verdict: 'pass', failures: [] };
  }
  const failures: string[] = [];
  for (const operation of corpusCase.expected.operations) {
    if (!worker.executedOperations.includes(operation)) {
      failures.push(`Expected operation was not executed: ${operation}`);
    }
  }
  for (const [key, expected] of Object.entries(corpusCase.expected.metadata)) {
    if (!Object.is(worker.metadata[key], expected)) {
      failures.push(
        `Metadata ${key} expected ${JSON.stringify(expected)}, received ${JSON.stringify(worker.metadata[key])}`,
      );
    }
  }
  if (corpusCase.expected.comparison.method === 'exact') {
    if (worker.canonical !== corpusCase.expected.comparison.canonical) {
      failures.push(
        `Canonical output expected ${corpusCase.expected.comparison.canonical}, received ${worker.canonical ?? '(missing)'}`,
      );
    }
    if (worker.outputSha256 !== corpusCase.expected.comparison.sha256) {
      failures.push('Canonical output SHA-256 does not match');
    }
  } else if (corpusCase.expected.comparison.method === 'tolerance') {
    failures.push('Tolerance comparison requires an independent reference output');
  }
  return { verdict: failures.length === 0 ? 'pass' : 'fail', failures };
}

export function verdictFor(
  corpusCase: CorpusCase,
  worker: PureJsImageWorkerResult,
): PureJsImageVerdict {
  return evaluateResult(corpusCase, worker).verdict;
}

export function summarizeResults(results: PureJsImageCaseResult[], durationMs: number) {
  const counts: Record<PureJsImageVerdict, number> = {
    pass: 0,
    fail: 0,
    unsupported: 0,
    timeout: 0,
    crash: 0,
    unavailable: 0,
  };
  for (const result of results) counts[result.verdict] += 1;
  return { total: results.length, ...counts, durationMs };
}

function markdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function resultMessage(result: PureJsImageCaseResult): string {
  if (result.worker?.kind === 'error') {
    const failures = result.expectationFailures?.length
      ? `; expectation failures: ${result.expectationFailures.join('; ')}`
      : '';
    return `${result.worker.error.code ? `${result.worker.error.code}: ` : ''}${result.worker.error.message}${failures}`;
  }
  if (result.error)
    return `${result.error.code ? `${result.error.code}: ` : ''}${result.error.message}`;
  if (result.worker?.kind === 'success') {
    const failures = result.expectationFailures?.length
      ? `; expectation failures: ${result.expectationFailures.join('; ')}`
      : '';
    return `${result.worker.implementation}; ${result.worker.operation}; ${result.worker.outputBytes} output bytes${failures}`;
  }
  return '';
}

export function renderPureJsImageReport(report: PureJsImageCorpusReport): string {
  const lines = [
    '# PureJsImage corpus report',
    '',
    `- Library: \`${report.library.packageName}@${report.library.version}\``,
    `- Git revision: \`${report.library.gitRevision ?? 'unavailable'}\`${report.library.gitDirty ? ' (dirty source checkout)' : ''}`,
    `- Executed dist SHA-256: \`${report.library.distSha256}\``,
    `- Selection: ${report.selection.kind}${report.selection.value ? ` \`${report.selection.value}\`` : ''}`,
    `- Cases: ${report.summary.total}`,
    `- Duration: ${report.summary.durationMs} ms`,
    '',
    '## Execution',
    '',
    `- Codec cases: ${report.execution.codec}`,
    `- Scientific cases: ${report.execution.scientific}`,
    `- Geospatial cases: ${report.execution.geo}`,
    `- Isolation: ${report.execution.isolation}`,
    `- Limits: catalog frame/pixel/heap/timeout limits; ${report.execution.timeoutGraceMs} ms process-start grace`,
    '',
    '## Verdicts',
    '',
    '| Verdict | Cases |',
    '| --- | ---: |',
  ];
  for (const verdict of verdictOrder) lines.push(`| ${verdict} | ${report.summary[verdict]} |`);

  const formats = new Map<
    string,
    { total: number; verdicts: Record<PureJsImageVerdict, number> }
  >();
  for (const result of report.results) {
    const current = formats.get(result.format) ?? {
      total: 0,
      verdicts: { pass: 0, fail: 0, unsupported: 0, timeout: 0, crash: 0, unavailable: 0 },
    };
    current.total += 1;
    current.verdicts[result.verdict] += 1;
    formats.set(result.format, current);
  }
  lines.push(
    '',
    '## By format',
    '',
    '| Format | Total | Pass | Fail | Unsupported | Timeout | Crash | Unavailable |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const [format, values] of [...formats].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    lines.push(
      `| \`${format}\` | ${values.total} | ${values.verdicts.pass} | ${values.verdicts.fail} | ${values.verdicts.unsupported} | ${values.verdicts.timeout} | ${values.verdicts.crash} | ${values.verdicts.unavailable} |`,
    );
  }

  lines.push(
    '',
    '## Cases',
    '',
    '| Case | Format | Expected | Verdict | Adapter and result | Time (ms) |',
    '| --- | --- | --- | --- | --- | ---: |',
  );
  for (const result of report.results) {
    lines.push(
      `| \`${result.caseId}\` | \`${result.format}\` | ${result.classification}/${result.expectedOutcome} | **${result.verdict}** | ${markdownCell(resultMessage(result))} | ${result.durationMs} |`,
    );
  }
  lines.push(
    '',
    '> `unsupported` is reported separately from failure. A generic valid corpus case does not imply',
    '> that the tested PureJsImage revision claims support for it.',
    '',
  );
  return lines.join('\n');
}
