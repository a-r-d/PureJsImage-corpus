import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Catalog, CorpusCase } from '../catalog/types.js';
import { loadCatalog } from '../catalog/load.js';
import { fromRoot } from '../catalog/paths.js';

const README_FORMAT_TABLE_TOKEN = '{{FORMAT_TABLE}}';
const README_CASE_COUNT_TOKEN = '{{CASE_COUNT}}';
const README_FORMAT_COUNT_TOKEN = '{{FORMAT_COUNT}}';

const FORMAT_DESCRIPTIONS: Record<string, string> = {
  'aperio-svs': 'Aperio pyramidal whole-slide microscopy images.',
  avif: 'AV1 Image File Format still images and metadata.',
  blockfile: 'NanoMegas ASTAR microscopy block data.',
  bmp: 'Windows and OS/2 bitmap variants, palettes, masks, and RLE.',
  cbf: 'Crystallographic Binary Format detector arrays.',
  dicom: 'Medical images and metadata in DICOM datasets.',
  'digital-surf': 'Digital Surf surface-metrology measurements.',
  dm3: 'Gatan DigitalMicrograph 3 microscopy data.',
  dm4: 'Gatan DigitalMicrograph 4 microscopy data.',
  emsa: 'EMSA/MAS spectroscopy text data.',
  envi: 'ENVI scientific raster headers with binary payloads.',
  'esri-ascii-grid': 'Text-based geospatial elevation or raster grids.',
  fits: 'Astronomy images and arrays in FITS containers.',
  'geo-envi': 'Georeferenced ENVI rasters in BIL, BIP, or BSQ layout.',
  geotiff: 'TIFF rasters with CRS and affine geospatial metadata.',
  geozarr: 'Chunked geospatial arrays stored as Zarr trees.',
  gif: 'Palette images and animation using GIF/LZW.',
  gsf: 'Gwyddion Simple Field surface data.',
  heic: 'HEIF/HEIC image containers and Apple image samples.',
  ico: 'Windows icon containers with bitmap or PNG images.',
  'image-world-file': 'Ordinary images paired with affine world files.',
  jp2: 'JPEG 2000 images in JP2 containers.',
  jpeg: 'Baseline, progressive, metadata-rich, and color JPEG images.',
  'jpeg-xl': 'JPEG XL images and JPEG reconstruction streams.',
  'meta-image': 'MetaImage headers with embedded or detached arrays.',
  mrc: 'MRC/CCP4 microscopy volumes and maps.',
  'nanonis-sxm': 'Nanonis scanning-probe microscopy measurements.',
  'ncem-emd': 'NCEM electron-microscopy data in HDF5.',
  'netcdf-4': 'Grouped HDF5-backed NetCDF-4 datasets.',
  'netcdf-cf': 'NetCDF datasets using Climate and Forecast metadata.',
  'netcdf-classic': 'Classic NetCDF multidimensional arrays.',
  nifti: 'NIfTI-1 and NIfTI-2 neuroimaging volumes.',
  npy: 'NumPy array files with explicit shape and dtype.',
  nrrd: 'Nearly Raw Raster Data images and volumes.',
  'ome-tiff': 'OME-XML microscopy metadata embedded in TIFF.',
  'ome-zarr': 'OME-NGFF multiscale microscopy stored as Zarr trees.',
  pam: 'Netpbm arbitrary maps, including alpha channels.',
  pbm: 'Netpbm monochrome bitmap images.',
  pfm: 'Portable floating-point maps in either byte order.',
  pgm: 'Netpbm grayscale images.',
  png: 'Lossless portable images, palettes, alpha, and animation.',
  ppm: 'Netpbm RGB images.',
  qoi: 'Quite OK Image streams and bounded parser failures.',
  'radiance-hdr': 'RGBE high-dynamic-range images.',
  rpl: 'Raw Parameter List headers paired with scientific arrays.',
  'srtm-hgt': 'SRTM elevation tiles encoded as signed big-endian samples.',
  tga: 'Truevision TGA raster images.',
  'tia-emi': 'FEI/TIA metadata paired with SER microscopy data.',
  'tia-ser': 'FEI/TIA SER microscopy images and spectra.',
  tiff: 'Tagged Image File Format strips, compression, and sample layouts.',
  'velox-emd': 'Thermo Fisher Velox electron-microscopy containers.',
  webp: 'Lossy, lossless, alpha, and animated WebP images.',
  x3p: 'OpenGPS XML plus binary surface-metrology archives.',
};

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

function joinedValues(values: Iterable<string>): string {
  return [...new Set(values)].sort().join(', ');
}

export function formatInventoryTable(catalog: Catalog): string {
  const undescribed = catalog.formats.filter((format) => FORMAT_DESCRIPTIONS[format] === undefined);
  const staleDescriptions = Object.keys(FORMAT_DESCRIPTIONS).filter(
    (format) => !catalog.formats.includes(format),
  );
  if (undescribed.length > 0 || staleDescriptions.length > 0) {
    throw new Error(
      `Format descriptions do not match the taxonomy: missing=${undescribed.join(',') || 'none'} stale=${staleDescriptions.join(',') || 'none'}`,
    );
  }

  const lines = [
    '| Format | What it exercises | Cases | Files | 📦 Local | ☁️ External | Domains | Layouts |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  let totalFiles = 0;
  let totalLocal = 0;
  let totalExternal = 0;
  for (const format of catalog.formats) {
    const cases = catalog.cases.filter((corpusCase) => corpusCase.format.family === format);
    const assets = cases.flatMap((corpusCase) => corpusCase.assets);
    const local = assets.filter((asset) => asset.storage !== 'external').length;
    const external = assets.length - local;
    totalFiles += assets.length;
    totalLocal += local;
    totalExternal += external;
    lines.push(
      `| **\`${format}\`** | ${FORMAT_DESCRIPTIONS[format]} | ${cases.length} | ${assets.length} | ${local} | ${external} | ${joinedValues(cases.map((item) => item.domain))} | ${joinedValues(cases.map((item) => item.layout.kind))} |`,
    );
  }
  lines.push(
    `| **Total: ${catalog.formats.length} formats** | Logical files, including shared references | **${catalog.cases.length}** | **${totalFiles}** | **${totalLocal}** | **${totalExternal}** | — | — |`,
  );
  return lines.join('\n');
}

export function renderReadme(template: string, catalog: Catalog): string {
  const replacements = new Map([
    [README_FORMAT_TABLE_TOKEN, formatInventoryTable(catalog)],
    [README_CASE_COUNT_TOKEN, String(catalog.cases.length)],
    [README_FORMAT_COUNT_TOKEN, String(catalog.formats.length)],
  ]);
  let readme = template;
  for (const [token, value] of replacements) {
    const parts = readme.split(token);
    if (parts.length !== 2) {
      throw new Error(`README.template.md must contain exactly one ${token}`);
    }
    readme = `${parts[0]}${value}${parts[1]}`;
  }
  return readme;
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
  const catalog = await loadCatalog(root);
  const files = generatedFiles(catalog);
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
  const readmePath = join(root, 'README.md');
  const readme = renderReadme(await readFile(join(root, 'README.template.md'), 'utf8'), catalog);
  if (check) {
    let existing = '';
    try {
      existing = await readFile(readmePath, 'utf8');
    } catch {
      // A missing generated README is reported as a difference below.
    }
    if (existing !== readme) throw new Error('Generated file is stale: README.md');
  } else {
    await writeFile(readmePath, readme);
  }
}
