#!/usr/bin/env node
import { resolve } from 'node:path';
import { Command } from 'commander';
import { loadCatalog, selectCollection } from '../catalog/load.js';
import { fromRoot } from '../catalog/paths.js';
import { runPureJsImageCorpus } from './runner.js';
import type { PureJsImageCorpusReport } from './types.js';

interface CliOptions {
  library: string;
  output: string;
  collection?: string;
  case?: string;
  offline?: boolean;
  allowFailures?: boolean;
}

const program = new Command();
program
  .name('report-purejsimage')
  .description(
    'Run corpus cases through an exact PureJsImage build and write JSON and Markdown reports',
  )
  .option(
    '--library <path>',
    'PureJsImage checkout or unpacked package',
    fromRoot('../PureJsImage'),
  )
  .option(
    '--output <path>',
    'report path without extension',
    fromRoot('reports/purejsimage/latest'),
  )
  .option('--collection <id>', 'run one collection instead of the complete corpus')
  .option('--case <case-id>', 'run one case instead of the complete corpus')
  .option('--offline', 'require every external asset to exist in the local cache')
  .option(
    '--allow-failures',
    'exit successfully for library failures while still failing on timeout, crash, or unavailable data',
  )
  .action(async (options: CliOptions) => {
    if (options.case && options.collection) throw new Error('Select either --case or --collection');
    const catalog = await loadCatalog();
    let cases = catalog.cases;
    let selection: PureJsImageCorpusReport['selection'] = { kind: 'all' };
    if (options.case) {
      const corpusCase = catalog.cases.find((candidate) => candidate.id === options.case);
      if (!corpusCase) throw new Error(`Unknown case: ${options.case}`);
      cases = [corpusCase];
      selection = { kind: 'case', value: options.case };
    } else if (options.collection) {
      cases = selectCollection(catalog, options.collection);
      selection = { kind: 'collection', value: options.collection };
    }
    const outputBase = resolve(options.output);
    const report = await runPureJsImageCorpus({
      root: fromRoot(),
      cacheRoot: fromRoot('.cache'),
      libraryPath: resolve(options.library),
      cases,
      offline: options.offline ?? false,
      outputBase,
      selection,
      onProgress: (completed, total, result) => {
        process.stdout.write(
          `[${String(completed).padStart(String(total).length)}/${total}] ${result.verdict.padEnd(11)} ${result.caseId}\n`,
        );
      },
    });
    process.stdout.write(
      `Wrote ${outputBase}.json and ${outputBase}.md: ${report.summary.pass} pass, ${report.summary.fail} fail, ${report.summary.unsupported} unsupported, ${report.summary.timeout} timeout, ${report.summary.crash} crash, ${report.summary.unavailable} unavailable.\n`,
    );
    if (
      (!options.allowFailures && report.summary.fail > 0) ||
      report.summary.timeout > 0 ||
      report.summary.crash > 0 ||
      report.summary.unavailable > 0
    ) {
      process.exitCode = 1;
    }
  });

await program.parseAsync();
