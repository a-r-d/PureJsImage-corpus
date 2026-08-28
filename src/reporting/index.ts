import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Catalog, CorpusCase } from '../catalog/types.js';
import { loadCatalog } from '../catalog/load.js';
import { fromRoot } from '../catalog/paths.js';

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function countBy(
  cases: CorpusCase[],
  key: (corpusCase: CorpusCase) => string[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const corpusCase of cases) {
    for (const value of key(corpusCase)) counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function featureValues(corpusCase: CorpusCase, prefix: string): string[] {
  return corpusCase.coverage.features
    .filter((feature) => feature.startsWith(prefix))
    .map((feature) => feature.slice(prefix.length));
}

export function buildCoverage(catalog: Catalog): Record<string, unknown> {
  const cases = catalog.cases;
  return {
    schemaVersion: 1,
    totalCases: cases.length,
    dimensions: {
      formatFamily: countBy(cases, (item) => [item.format.family]),
      dialect: countBy(cases, (item) => [item.format.dialect ?? 'unspecified']),
      layoutType: countBy(cases, (item) => [item.layout.kind]),
      classification: countBy(cases, (item) => [item.expected.classification]),
      bitDepth: countBy(cases, (item) => featureValues(item, 'image.bit-depth.')),
      sampleType: countBy(cases, (item) => featureValues(item, 'image.sample.')),
      colorModel: countBy(cases, (item) => featureValues(item, 'image.color.')),
      compression: countBy(cases, (item) => featureValues(item, 'compression.')),
      endianness: countBy(cases, (item) => featureValues(item, 'endian.')),
      frameCount: countBy(cases, (item) => featureValues(item, 'frames.')),
      dimensionalityAndAxes: countBy(cases, (item) => featureValues(item, 'axes.')),
      tiling: countBy(cases, (item) => featureValues(item, 'tiling.')),
      pyramids: countBy(cases, (item) => featureValues(item, 'pyramids.')),
      companionFiles: countBy(cases, (item) =>
        item.layout.kind === 'companion-set' ? ['yes'] : ['no'],
      ),
      directoryTrees: countBy(cases, (item) =>
        item.layout.kind === 'directory-tree' ? ['yes'] : ['no'],
      ),
      httpRange: countBy(cases, (item) =>
        item.coverage.features.includes('http.range') ? ['yes'] : ['no'],
      ),
      pureJsImageRegistration: countBy(cases, (item) => featureValues(item, 'purejsimage.reader.')),
    },
  };
}

function coverageMarkdown(coverage: Record<string, unknown>): string {
  const dimensions = coverage.dimensions as Record<string, Record<string, number>>;
  const lines = ['# Corpus coverage', '', `Total cases: ${String(coverage.totalCases)}`, ''];
  for (const [dimension, values] of Object.entries(dimensions)) {
    lines.push(`## ${dimension}`, '', '| Value | Cases |', '| --- | ---: |');
    for (const [value, count] of Object.entries(values)) lines.push(`| ${value} | ${count} |`);
    lines.push('');
  }
  return lines.join('\n');
}

function notice(catalog: Catalog): string {
  const groups = new Map<string, { evidence: string; attribution: Set<string>; cases: string[] }>();
  for (const corpusCase of catalog.cases) {
    const key = corpusCase.rights.licenseName;
    const group = groups.get(key) ?? {
      evidence: corpusCase.rights.evidenceUrl,
      attribution: new Set<string>(),
      cases: [],
    };
    if (corpusCase.rights.attribution) group.attribution.add(corpusCase.rights.attribution);
    group.cases.push(corpusCase.id);
    groups.set(key, group);
  }
  const lines = [
    '# NOTICE',
    '',
    'This file is generated from case-level rights records. It is evidence, not legal advice.',
    '',
  ];
  for (const [license, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${license}`, '', `Evidence: ${group.evidence}`, '');
    if (group.attribution.size > 0) {
      lines.push('Attribution:', '');
      for (const value of [...group.attribution].sort()) lines.push(`- ${value}`);
      lines.push('');
    }
    lines.push('Cases:', '');
    for (const id of group.cases.sort()) lines.push(`- ${id}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function generatedFiles(catalog: Catalog): Record<string, string> {
  const catalogDocument = {
    schemaVersion: 1,
    sources: catalog.sources,
    cases: catalog.cases,
    collections: catalog.collections,
    taxonomy: { features: catalog.features, formats: catalog.formats },
  };
  const checksums = new Map<string, string>();
  for (const corpusCase of catalog.cases) {
    for (const asset of corpusCase.assets) {
      if (asset.storage !== 'external')
        checksums.set(
          asset.sha256,
          `assets/vendored/sha256/${asset.sha256.slice(0, 2)}/${asset.sha256}`,
        );
    }
  }
  const coverage = buildCoverage(catalog);
  return {
    'catalog.json': stableJson(catalogDocument),
    'cases.jsonl': `${catalog.cases.map((item) => JSON.stringify(item)).join('\n')}\n`,
    'checksums.sha256': `${[...checksums]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hash, path]) => `${hash}  ${path}`)
      .join('\n')}\n`,
    'NOTICE.md': notice(catalog),
    'coverage.json': stableJson(coverage),
    'coverage.md': coverageMarkdown(coverage),
  };
}

export async function buildIndexes(root = fromRoot(), check = false): Promise<void> {
  const files = generatedFiles(await loadCatalog(root));
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, 'generated', name);
    if (check) {
      let existing = '';
      try {
        existing = await readFile(path, 'utf8');
      } catch {
        // A missing generated file is reported as a difference below.
      }
      if (existing !== content) throw new Error(`Generated file is stale: generated/${name}`);
    } else {
      await writeFile(path, content);
    }
  }
}
