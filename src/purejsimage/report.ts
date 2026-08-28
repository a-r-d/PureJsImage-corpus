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

export function verdictFor(
  corpusCase: CorpusCase,
  worker: PureJsImageWorkerResult,
): PureJsImageVerdict {
  if (worker.kind === 'success') {
    return corpusCase.expected.outcome === 'reject' ? 'fail' : 'pass';
  }
  if (corpusCase.expected.outcome === 'reject') return 'pass';
  return isUnsupported(worker) ? 'unsupported' : 'fail';
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
    return `${result.worker.error.code ? `${result.worker.error.code}: ` : ''}${result.worker.error.message}`;
  }
  if (result.error)
    return `${result.error.code ? `${result.error.code}: ` : ''}${result.error.message}`;
  if (result.worker?.kind === 'success') {
    return `${result.worker.implementation}; ${result.worker.operation}; ${result.worker.outputBytes} output bytes`;
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
