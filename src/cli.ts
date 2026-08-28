#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { loadCatalog, selectCollection } from './catalog/load.js';
import { fromRoot } from './catalog/paths.js';
import { resolveGitHubRevision } from './catalog/update-source.js';
import { fetchAsset } from './download/fetch.js';
import { inspectLegacyManifest } from './migration/purejsimage.js';
import { materializeCase } from './materialize/index.js';
import { buildIndexes, buildCoverage } from './reporting/index.js';
import { createCorpusServer } from './server/index.js';
import { validateRepository } from './validation/index.js';

const program = new Command();
program.name('purejsimage-corpus').description('Manage the PureJsImage format corpus');

program.command('validate').action(async () => {
  const issues = await validateRepository();
  if (issues.length > 0) {
    for (const item of issues) process.stderr.write(`${item.location}: ${item.message}\n`);
    process.exitCode = 1;
    return;
  }
  const catalog = await loadCatalog();
  process.stdout.write(
    `Validated ${catalog.sources.length} sources, ${catalog.cases.length} cases, and ${catalog.collections.length} collections.\n`,
  );
});

program
  .command('list')
  .option('--format <family>')
  .option('--domain <domain>')
  .action(async (options: { format?: string; domain?: string }) => {
    const catalog = await loadCatalog();
    for (const corpusCase of catalog.cases) {
      if (options.format && corpusCase.format.family !== options.format) continue;
      if (options.domain && corpusCase.domain !== options.domain) continue;
      process.stdout.write(
        `${corpusCase.id}\t${corpusCase.format.family}\t${corpusCase.layout.kind}\n`,
      );
    }
  });

program
  .command('inspect')
  .argument('<case-id>')
  .action(async (id: string) => {
    const corpusCase = (await loadCatalog()).cases.find((candidate) => candidate.id === id);
    if (!corpusCase) throw new Error(`Unknown case: ${id}`);
    process.stdout.write(`${JSON.stringify(corpusCase, null, 2)}\n`);
  });

function casesOption(command: Command): Command {
  return command.option('--collection <id>').option('--case <case-id>');
}

async function selectedCases(options: { collection?: string; case?: string }) {
  const catalog = await loadCatalog();
  if (options.case) {
    const corpusCase = catalog.cases.find((candidate) => candidate.id === options.case);
    if (!corpusCase) throw new Error(`Unknown case: ${options.case}`);
    return [corpusCase];
  }
  return selectCollection(catalog, options.collection ?? 'smoke');
}

casesOption(program.command('sync'))
  .option('--offline')
  .action(async (options: { collection?: string; case?: string; offline?: boolean }) => {
    const cases = await selectedCases(options);
    for (const corpusCase of cases)
      await materializeCase(corpusCase, {
        root: fromRoot(),
        cacheRoot: fromRoot('.cache'),
        offline: options.offline ?? false,
      });
    process.stdout.write(`Materialized ${cases.length} cases.\n`);
  });

casesOption(program.command('verify'))
  .option('--offline')
  .action(async (options: { collection?: string; case?: string; offline?: boolean }) => {
    const cases = await selectedCases(options);
    const seen = new Set<string>();
    for (const corpusCase of cases) {
      for (const asset of corpusCase.assets) {
        if (seen.has(asset.sha256)) continue;
        seen.add(asset.sha256);
        const path =
          asset.storage === 'external'
            ? await fetchAsset(asset, {
                cacheRoot: fromRoot('.cache'),
                offline: options.offline ?? false,
              })
            : join(fromRoot(), 'assets/vendored/sha256', asset.sha256.slice(0, 2), asset.sha256);
        const info = await stat(path);
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
        const actual = hash.digest('hex');
        if (info.size !== asset.bytes || actual !== asset.sha256)
          throw new Error(`Verification failed: ${corpusCase.id}/${asset.path}`);
      }
    }
    process.stdout.write(`Verified ${cases.length} cases and ${seen.size} unique blobs.\n`);
  });

program
  .command('build-index')
  .option('--check')
  .action(async (options: { check?: boolean }) => {
    await buildIndexes(fromRoot(), options.check ?? false);
    process.stdout.write(
      options.check ? 'Generated indexes are current.\n' : 'Built generated indexes.\n',
    );
  });

program.command('coverage').action(async () => {
  await buildIndexes();
  const coverage = buildCoverage(await loadCatalog());
  process.stdout.write(`${JSON.stringify(coverage, null, 2)}\n`);
});

program
  .command('migrate-purejsimage')
  .argument('<path-or-url>')
  .action(async (input: string) => {
    const text = /^https?:\/\//.test(input)
      ? await fetch(input).then(async (response) => {
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          return response.text();
        })
      : await readFile(input, 'utf8');
    process.stdout.write(
      `${JSON.stringify(inspectLegacyManifest(JSON.parse(text) as unknown), null, 2)}\n`,
    );
  });

program
  .command('update-source')
  .argument('<source-id>')
  .action(async (id: string) => {
    const source = (await loadCatalog()).sources.find((candidate) => candidate.id === id);
    if (!source) throw new Error(`Unknown source: ${id}`);
    const revision = await resolveGitHubRevision(source, fetch, process.env.GITHUB_TOKEN);
    process.stdout.write(
      `${JSON.stringify({ sourceId: id, current: source.pinnedRevision, resolved: revision, changed: source.pinnedRevision !== revision }, null, 2)}\n`,
    );
  });

program.command('audit-links').action(async () => {
  const catalog = await loadCatalog();
  const urls = [
    ...new Set(
      catalog.sources.flatMap((source) => [
        ...source.evidence.sourceUrls,
        ...source.evidence.licenseUrls,
      ]),
    ),
  ].sort();
  let failures = 0;
  for (let offset = 0; offset < urls.length; offset += 6) {
    await Promise.all(
      urls.slice(offset, offset + 6).map(async (url) => {
        try {
          const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
          if (!response.ok) throw new Error(String(response.status));
          process.stdout.write(`ok\t${url}\n`);
        } catch (error: unknown) {
          failures += 1;
          process.stdout.write(`failed\t${url}\t${String(error)}\n`);
        }
      }),
    );
  }
  if (failures > 0) process.exitCode = 1;
});

program
  .command('serve')
  .option('--collection <id>', 'collection to serve', 'smoke')
  .option('--port <number>', 'port', '8787')
  .action(async (options: { collection: string; port: string }) => {
    const cases = selectCollection(await loadCatalog(), options.collection);
    const server = await createCorpusServer(cases, {
      root: fromRoot(),
      cacheRoot: fromRoot('.cache'),
      offline: false,
    });
    const port = Number(options.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
    server.listen(port, '127.0.0.1', () =>
      process.stdout.write(`Serving ${cases.length} cases at http://127.0.0.1:${port}/cases/\n`),
    );
  });

await program.parseAsync();
