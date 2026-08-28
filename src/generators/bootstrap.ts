import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import type { CollectionRecord, CorpusCase, SourceRecord } from '../catalog/types.js';
import { fromRoot } from '../catalog/paths.js';
import { vendoredBlobPath } from '../cache/paths.js';
import { applyMutations, type MutationOperation } from '../mutations/apply.js';
import { generateFixture, sha256 } from './fixtures.js';

const root = fromRoot();
const resolvedAt = '2026-08-28T00:00:00.000Z';
const generatedSourceId = 'purejsimage-corpus-generated';

interface LegacyEntry {
  id: string;
  file: string;
  url: string;
  sourcePage: string;
  author: string;
  license: string;
  expected: Record<string, string | number> & { format: string; sha256: string };
}

interface GeneratedSeed {
  id: string;
  domain: CorpusCase['domain'];
  family: string;
  generator: string;
  parameters?: Record<string, unknown>;
  title: string;
  layout?: CorpusCase['layout']['kind'];
  entrypoint?: string;
  features: string[];
  collections: string[];
  registration: string;
}

interface ExternalFile {
  path: string;
  role: CorpusCase['assets'][number]['role'];
  sourcePath: string;
  sha256: string;
  bytes: number;
}

interface ExternalSeed {
  id: string;
  domain?: CorpusCase['domain'];
  family: string;
  sourceId: string;
  title: string;
  files: ExternalFile[];
  baseUrl: string;
  originalUrl: string;
  layout?: CorpusCase['layout']['kind'];
  entrypoint?: string;
  registration: string;
  privacy?: CorpusCase['privacy'];
  rights?: CorpusCase['rights'];
}

interface NegativeSeed {
  id: string;
  parentId: string;
  targetPath: string;
  description: string;
  feature: string;
  operations: MutationOperation[];
  omitOutput?: boolean;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, json(value));
}

function source(
  id: string,
  project: string,
  homepage: string,
  sourceType: SourceRecord['sourceType'],
  pinnedRevision: string,
  licenseUrls: string[],
  redistribution: SourceRecord['defaultRedistribution'] = 'unknown',
  trackingRef = 'main',
): SourceRecord {
  return {
    schemaVersion: 1,
    id,
    project,
    homepage,
    sourceType,
    trackingRef,
    pinnedRevision,
    evidence: { sourceUrls: [homepage], licenseUrls },
    defaultRedistribution: redistribution,
    expectedStability: sourceType.startsWith('github') ? 'repository' : 'unstable',
    updatePolicy:
      'Resolve explicitly, review license evidence, and accept changed bytes only by command.',
    notes: ['The source record does not grant rights to every third-party asset it may contain.'],
  };
}

const sources: SourceRecord[] = [
  source(
    'purejsimage',
    'PureJsImage',
    'https://github.com/a-r-d/PureJsImage',
    'github-repository',
    '3a1b9936037b308181840a8db65cf4476e70e737',
    ['https://github.com/a-r-d/PureJsImage/blob/3a1b9936037b308181840a8db65cf4476e70e737/LICENSE'],
    'unknown',
  ),
  source(
    'imazen-codec-corpus',
    'Imazen codec-corpus',
    'https://github.com/imazen/codec-corpus',
    'github-repository',
    '4fdbdf17909594c1ea96bd879d1785ef507161d0',
    ['https://github.com/imazen/codec-corpus/tree/4fdbdf17909594c1ea96bd879d1785ef507161d0'],
    'unknown',
  ),
  source(
    'pngsuite',
    'PNGSuite',
    'https://www.libpng.org/pub/png/pngsuite.html',
    'http-index',
    'snapshot-2026-08-28',
    ['https://www.libpng.org/pub/png/pngsuite.html'],
    'allowed',
    'website',
  ),
  source(
    'lunapaint-pngsuite',
    'LunaPaint PNGSuite',
    'https://github.com/lunapaint/pngsuite',
    'github-repository',
    '8cd768dd0d0063195174d0d01cacbd5a7d1e5605',
    ['https://github.com/lunapaint/pngsuite/tree/8cd768dd0d0063195174d0d01cacbd5a7d1e5605'],
    'unknown',
  ),
  source(
    'libjpeg-turbo',
    'libjpeg-turbo',
    'https://github.com/libjpeg-turbo/libjpeg-turbo/tree/main/testimages',
    'github-tree',
    '1157d37cfab977f8f7f8344aededdfd951222c89',
    [
      'https://github.com/libjpeg-turbo/libjpeg-turbo/blob/1157d37cfab977f8f7f8344aededdfd951222c89/LICENSE.md',
    ],
    'allowed',
  ),
  source(
    'libwebp-test-data',
    'libwebp-test-data',
    'https://github.com/webmproject/libwebp-test-data',
    'github-repository',
    '06ddd96e276c2c638a72d39d3c0f340afd61978c',
    [
      'https://github.com/webmproject/libwebp-test-data/tree/06ddd96e276c2c638a72d39d3c0f340afd61978c',
    ],
    'unknown',
  ),
  source(
    'libavif',
    'libavif',
    'https://github.com/AOMediaCodec/libavif/tree/main/tests/data',
    'github-tree',
    'eb673097950e0b0ec77f696958091ef0244a45a9',
    [
      'https://github.com/AOMediaCodec/libavif/blob/eb673097950e0b0ec77f696958091ef0244a45a9/LICENSE',
    ],
    'unknown',
  ),
  source(
    'libjxl',
    'libjxl',
    'https://github.com/libjxl/libjxl/tree/main/testdata',
    'github-tree',
    'aea3a06e281fdee13e04815bfbf4f4132e7f59ea',
    ['https://github.com/libjxl/libjxl/blob/aea3a06e281fdee13e04815bfbf4f4132e7f59ea/LICENSE'],
    'unknown',
  ),
  source(
    'libjxl-testdata',
    'libjxl testdata submodule',
    'https://github.com/libjxl/testdata',
    'github-tree',
    '73695d303670c90e4d506ea89d9901b081385089',
    ['https://github.com/libjxl/testdata/tree/73695d303670c90e4d506ea89d9901b081385089'],
    'unknown',
  ),
  source(
    'openjpeg-data',
    'OpenJPEG data',
    'https://github.com/uclouvain/openjpeg-data',
    'github-repository',
    '39524bd3a601d90ed8e0177559400d23945f96a9',
    ['https://github.com/uclouvain/openjpeg-data/tree/39524bd3a601d90ed8e0177559400d23945f96a9'],
    'unknown',
  ),
  source(
    'libtiff-pics',
    'libtiff pics',
    'https://gitlab.com/libtiff/libtiff-pics',
    'github-repository',
    'pics-3.8.0',
    ['https://gitlab.com/libtiff/libtiff-pics'],
    'unknown',
    'default',
  ),
  source(
    'libtiff-pics-archive',
    'libtiff pics 3.8.0 archive',
    'https://download.osgeo.org/libtiff/pics-3.8.0.tar.gz',
    'archive',
    'pics-3.8.0',
    ['https://gitlab.com/libtiff/libtiff'],
    'unknown',
    'release',
  ),
  source(
    'bmpsuite',
    'BMP Suite',
    'https://entropymine.com/jason/bmpsuite/',
    'http-index',
    'bmpsuite-2.8',
    ['https://entropymine.com/jason/bmpsuite/'],
    'allowed',
    'website',
  ),
  source(
    'bmpsuite-archive',
    'BMP Suite 2.8',
    'https://entropymine.com/jason/bmpsuite/releases/bmpsuite-2.8.zip',
    'archive',
    '2.8',
    ['https://entropymine.com/jason/bmpsuite/'],
    'allowed',
    'release',
  ),
  source(
    'libheif',
    'libheif',
    'https://github.com/strukturag/libheif',
    'github-repository',
    '2bc82b493dd8896fab3226f01977c7ac9d2ea3b8',
    ['https://github.com/strukturag/libheif/blob/2bc82b493dd8896fab3226f01977c7ac9d2ea3b8/COPYING'],
    'unknown',
  ),
  source(
    'qoi',
    'QOI',
    'https://github.com/phoboslab/qoi',
    'github-repository',
    '97bacc86a9c4abf5a2d452102dc26546c4c670b9',
    ['https://github.com/phoboslab/qoi/blob/97bacc86a9c4abf5a2d452102dc26546c4c670b9/LICENSE'],
    'allowed',
  ),
  source(
    'radiance',
    'Radiance',
    'https://github.com/LBNL-ETA/Radiance',
    'github-repository',
    'e3749f9e69acf32c7ccca65d4a39ecdff565af39',
    [
      'https://github.com/LBNL-ETA/Radiance/blob/e3749f9e69acf32c7ccca65d4a39ecdff565af39/License.txt',
    ],
    'unknown',
  ),
  source(
    'rosettasciio',
    'RosettaSciIO test data',
    'https://github.com/hyperspy/rosettasciio',
    'github-tree',
    'bc254db14cd7d4d23169b11aeb622a0a7eac1fbe',
    [
      'https://github.com/hyperspy/rosettasciio/blob/bc254db14cd7d4d23169b11aeb622a0a7eac1fbe/LICENSE',
    ],
    'unknown',
  ),
  source(
    'surface-topography',
    'SurfaceTopography examples',
    'https://github.com/ContactEngineering/SurfaceTopography/tree/master/test/file_format_examples',
    'github-tree',
    '52b45d838418e292ecf4400cd9744573cd84493e',
    [
      'https://github.com/ContactEngineering/SurfaceTopography/blob/52b45d838418e292ecf4400cd9744573cd84493e/LICENSE',
    ],
    'unknown',
  ),
  source(
    'pydicom-data',
    'pydicom-data',
    'https://github.com/pydicom/pydicom-data/tree/master/data_store/data',
    'github-tree',
    'abc42b90985fb6cf385aa4af766d2c9c94a257a4',
    ['https://github.com/pydicom/pydicom-data/tree/abc42b90985fb6cf385aa4af766d2c9c94a257a4'],
    'unknown',
  ),
  source(
    'nibabel',
    'nibabel test data',
    'https://github.com/nipy/nibabel/tree/master/nibabel/tests/data',
    'github-tree',
    '014fc4a952aa4cec4daa94384a8d63e81f71457a',
    ['https://github.com/nipy/nibabel/blob/014fc4a952aa4cec4daa94384a8d63e81f71457a/COPYING'],
    'unknown',
  ),
  source(
    'mrcfile',
    'mrcfile test data',
    'https://github.com/ccpem/mrcfile/tree/master/tests/test_data',
    'github-tree',
    'a2a8c6b569a57b7f18b023b5056fa7a14f2f99c2',
    ['https://github.com/ccpem/mrcfile/blob/a2a8c6b569a57b7f18b023b5056fa7a14f2f99c2/LICENSE.txt'],
    'unknown',
  ),
  source(
    'openmicroscopy-images',
    'Open Microscopy test images',
    'https://downloads.openmicroscopy.org/images/',
    'http-index',
    'snapshot-2026-08-28',
    ['https://downloads.openmicroscopy.org/images/'],
    'unknown',
    'website',
  ),
  source(
    'openmicroscopy-ome-tiff-2016-06',
    'OME-TIFF 2016-06 samples',
    'https://downloads.openmicroscopy.org/images/OME-TIFF/2016-06/',
    'http-index',
    '2016-06',
    ['https://downloads.openmicroscopy.org/images/OME-TIFF/2016-06/'],
    'unknown',
    'release',
  ),
  source(
    'openslide-testdata',
    'OpenSlide test data',
    'https://openslide.cs.cmu.edu/download/openslide-testdata/',
    'http-index',
    'snapshot-2026-08-28',
    ['https://openslide.org/'],
    'download-only',
    'website',
  ),
  source(
    'ome-ngff-validator',
    'OME-NGFF validator samples',
    'https://ome.github.io/ome-ngff-validator/samples',
    'github-tree',
    '5b28b6bf14fb2fbb8c11b8d4f6008838ba589912',
    [
      'https://github.com/ome/ome-ngff-validator/blob/5b28b6bf14fb2fbb8c11b8d4f6008838ba589912/LICENSE',
    ],
    'unknown',
  ),
  source(
    'ome-ngff-spec',
    'OME-NGFF specification',
    'https://ngff.openmicroscopy.org/latest/',
    'http-index',
    '0.5',
    ['https://github.com/ome/ngff'],
    'unknown',
    'latest',
  ),
  source(
    'itk-testing-data',
    'ITKTestingData',
    'https://github.com/InsightSoftwareConsortium/ITKTestingData',
    'github-repository',
    '90f1ac8644568c7b9857395e77d83211a8b00c14',
    [
      'https://github.com/InsightSoftwareConsortium/ITKTestingData/tree/90f1ac8644568c7b9857395e77d83211a8b00c14',
    ],
    'unknown',
  ),
  source(
    'astropy-data',
    'Astropy data',
    'https://github.com/astropy/astropy-data',
    'github-repository',
    '55caddceddd4eb1694bb3712e4ab6358c15afe67',
    ['https://github.com/astropy/astropy-data/tree/55caddceddd4eb1694bb3712e4ab6358c15afe67'],
    'unknown',
  ),
  source(
    'kikuchipy-data',
    'kikuchipy data',
    'https://github.com/pyxem/kikuchipy-data',
    'github-repository',
    'bcab8f7a4ffdb86a97f14e2327a4813d3156a85e',
    ['https://github.com/pyxem/kikuchipy-data/tree/bcab8f7a4ffdb86a97f14e2327a4813d3156a85e'],
    'unknown',
  ),
  source(
    'fabio',
    'FabIO',
    'https://github.com/silx-kit/fabio',
    'github-repository',
    '0d1c2bdda5b815566d165cf57c99bf561f05059f',
    ['https://github.com/silx-kit/fabio/blob/0d1c2bdda5b815566d165cf57c99bf561f05059f/copyright'],
    'unknown',
  ),
  source(
    'geotiff-test-data',
    'GeoTIFF test data',
    'https://github.com/GeoTIFF/test-data',
    'github-repository',
    '8506204783ff26a6c49ed1f721e7e1635b2e43ee',
    ['https://github.com/GeoTIFF/test-data/tree/8506204783ff26a6c49ed1f721e7e1635b2e43ee'],
    'unknown',
  ),
  source(
    'gdal-aaigrid',
    'GDAL AAIGrid tests',
    'https://github.com/OSGeo/gdal/tree/master/autotest/gdrivers/data/aaigrid',
    'github-tree',
    '37d8fb785f6ca88b78460462942f328f1f60aeab',
    ['https://github.com/OSGeo/gdal/blob/37d8fb785f6ca88b78460462942f328f1f60aeab/LICENSE.TXT'],
    'unknown',
  ),
  source(
    'gdal-envi',
    'GDAL ENVI tests',
    'https://github.com/OSGeo/gdal/tree/master/autotest/gdrivers/data/envi',
    'github-tree',
    '37d8fb785f6ca88b78460462942f328f1f60aeab',
    ['https://github.com/OSGeo/gdal/blob/37d8fb785f6ca88b78460462942f328f1f60aeab/LICENSE.TXT'],
    'unknown',
  ),
  source(
    'unidata-netcdf-examples',
    'Unidata NetCDF examples',
    'https://archive.unidata.ucar.edu/software/netcdf/examples/files.html',
    'http-index',
    'snapshot-2026-08-28',
    ['https://www.unidata.ucar.edu/about/legal/'],
    'unknown',
    'website',
  ),
  source(
    'unidata-netcdf-c',
    'Unidata netcdf-c test data',
    'https://github.com/Unidata/netcdf-c',
    'github-tree',
    '2ed1b285b9c9dbac7de2c7d330e576be16dcade8',
    ['https://github.com/Unidata/netcdf-c/blob/2ed1b285b9c9dbac7de2c7d330e576be16dcade8/COPYRIGHT'],
    'unknown',
  ),
  {
    schemaVersion: 1,
    id: generatedSourceId,
    project: 'purejsimage-corpus deterministic generators',
    homepage: 'https://github.com/a-r-d/purejsimage-corpus',
    sourceType: 'generated',
    pinnedRevision: 'generator-v1',
    evidence: {
      sourceUrls: ['https://github.com/a-r-d/purejsimage-corpus'],
      licenseUrls: ['https://creativecommons.org/publicdomain/zero/1.0/'],
    },
    defaultRedistribution: 'allowed',
    expectedStability: 'immutable',
    updatePolicy: 'A changed generator output requires a caseRevision bump and explicit review.',
    notes: ['Byte layouts are written directly from public format specifications.'],
  },
];

const commonFeatures = [
  'image.bit-depth.unknown',
  'image.sample.unknown',
  'image.color.unknown',
  'compression.unknown',
  'frames.single',
  'axes.xy',
];

function privacyNotRequired(): CorpusCase['privacy'] {
  return {
    reviewStatus: 'not-required',
    containsHumanData: false,
    phi: 'none',
    burnedInText: 'none',
    gps: 'none',
    faces: 'none',
    deidentified: 'not-applicable',
    notes: ['No human-derived medical data.'],
  };
}

function expected(
  classification: CorpusCase['expected']['classification'],
  outcome: CorpusCase['expected']['outcome'],
  metadata: CorpusCase['expected']['metadata'],
  maxInputBytes: number,
): CorpusCase['expected'] {
  return {
    classification,
    outcome,
    operations: ['metadata', 'full-decode', 'range-read'],
    comparison: { method: 'structural' },
    metadata,
    resourceLimits: {
      timeoutMs: 5000,
      maxInputBytes,
      maxDecodedPixels: 100_000_000,
      maxFrames: 1000,
      maxHeapMiB: 512,
    },
  };
}

const generatedSeeds: GeneratedSeed[] = [
  {
    id: 'ordinary/qoi/rgba-2x2',
    domain: 'ordinary',
    family: 'qoi',
    generator: 'qoi-rgba',
    title: 'QOI RGBA 2 by 2',
    features: ['image.bit-depth.8', 'image.sample.unsigned', 'image.color.rgba', 'compression.qoi'],
    collections: ['smoke', 'ordinary-conformance'],
    registration: 'qoi',
  },
  {
    id: 'ordinary/radiance/rgbe-2x2',
    domain: 'ordinary',
    family: 'radiance-hdr',
    generator: 'radiance-rgbe',
    title: 'Radiance RGBE 2 by 2',
    features: ['image.bit-depth.8', 'image.sample.float', 'image.color.rgbe', 'compression.rle'],
    collections: ['smoke', 'ordinary-conformance'],
    registration: 'radiance-hdr',
  },
  {
    id: 'ordinary/ico/rgba-1x1',
    domain: 'ordinary',
    family: 'ico',
    generator: 'ico-dib',
    title: 'ICO DIB RGBA 1 by 1',
    features: [
      'image.bit-depth.32',
      'image.sample.unsigned',
      'image.color.rgba',
      'compression.none',
    ],
    collections: ['smoke', 'ordinary-conformance'],
    registration: 'ico',
  },
  {
    id: 'ordinary/tga/rgb-2x2',
    domain: 'ordinary',
    family: 'tga',
    generator: 'tga-rgb',
    title: 'TGA RGB 2 by 2',
    features: ['image.bit-depth.8', 'image.sample.unsigned', 'image.color.rgb', 'compression.none'],
    collections: ['smoke', 'ordinary-conformance'],
    registration: 'tga',
  },
  {
    id: 'ordinary/netpbm/pbm-ascii',
    domain: 'ordinary',
    family: 'pbm',
    generator: 'pbm-ascii',
    title: 'PBM ASCII comments and whitespace',
    features: [
      'image.bit-depth.1',
      'image.sample.unsigned',
      'image.color.bilevel',
      'compression.none',
    ],
    collections: ['smoke', 'ordinary-conformance'],
    registration: 'netpbm',
  },
  {
    id: 'ordinary/netpbm/pgm-binary',
    domain: 'ordinary',
    family: 'pgm',
    generator: 'pgm-binary',
    title: 'PGM binary boundary values',
    features: [
      'image.bit-depth.8',
      'image.sample.unsigned',
      'image.color.gray',
      'compression.none',
    ],
    collections: ['smoke', 'ordinary-conformance'],
    registration: 'netpbm',
  },
  {
    id: 'ordinary/netpbm/ppm-binary',
    domain: 'ordinary',
    family: 'ppm',
    generator: 'ppm-binary',
    title: 'PPM binary primary colors',
    features: ['image.bit-depth.8', 'image.sample.unsigned', 'image.color.rgb', 'compression.none'],
    collections: ['smoke', 'ordinary-conformance'],
    registration: 'netpbm',
  },
  {
    id: 'ordinary/netpbm/pam-rgba',
    domain: 'ordinary',
    family: 'pam',
    generator: 'pam-rgba',
    title: 'PAM RGBA alpha boundary',
    features: [
      'image.bit-depth.8',
      'image.sample.unsigned',
      'image.color.rgba',
      'compression.none',
    ],
    collections: ['smoke', 'ordinary-conformance'],
    registration: 'netpbm',
  },
  {
    id: 'ordinary/pfm/rgb-little-endian',
    domain: 'ordinary',
    family: 'pfm',
    generator: 'pfm',
    parameters: { endian: 'little' },
    title: 'PFM RGB little-endian',
    features: [
      'image.bit-depth.32',
      'image.sample.float',
      'image.color.rgb',
      'compression.none',
      'endian.little',
    ],
    collections: ['smoke', 'ordinary-conformance'],
    registration: 'netpbm',
  },
  {
    id: 'ordinary/pfm/rgb-big-endian',
    domain: 'ordinary',
    family: 'pfm',
    generator: 'pfm',
    parameters: { endian: 'big' },
    title: 'PFM RGB big-endian',
    features: [
      'image.bit-depth.32',
      'image.sample.float',
      'image.color.rgb',
      'compression.none',
      'endian.big',
    ],
    collections: ['smoke', 'ordinary-conformance'],
    registration: 'netpbm',
  },
  {
    id: 'ordinary/tiff/gray-2x2',
    domain: 'ordinary',
    family: 'tiff',
    generator: 'tiff',
    title: 'TIFF grayscale 2 by 2',
    features: [
      'image.bit-depth.8',
      'image.sample.unsigned',
      'image.color.gray',
      'compression.none',
      'endian.little',
    ],
    collections: ['smoke', 'ordinary-conformance'],
    registration: 'tiff',
  },
  {
    id: 'scientific/meta-image/int16-3x2',
    domain: 'scientific',
    family: 'meta-image',
    generator: 'meta-image',
    title: 'MetaImage MHD plus RAW',
    layout: 'companion-set',
    entrypoint: 'tiny.mhd',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.gray',
      'compression.none',
      'endian.little',
      'layout.companion-set',
      'companion-files',
    ],
    collections: ['smoke', 'scientific-small', 'directory-formats'],
    registration: 'meta-image',
  },
  {
    id: 'scientific/rpl/uint16-3x2',
    domain: 'scientific',
    family: 'rpl',
    generator: 'ripple',
    title: 'RPL plus RAW unsigned data',
    layout: 'companion-set',
    entrypoint: 'tiny.rpl',
    features: [
      'image.bit-depth.16',
      'image.sample.unsigned',
      'image.color.gray',
      'compression.none',
      'endian.little',
      'layout.companion-set',
      'companion-files',
    ],
    collections: ['smoke', 'scientific-small', 'directory-formats'],
    registration: 'rpl',
  },
  {
    id: 'scientific/fits/int16-3x2',
    domain: 'scientific',
    family: 'fits',
    generator: 'fits',
    title: 'FITS int16 primary array',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.gray',
      'compression.none',
      'endian.big',
    ],
    collections: ['smoke', 'scientific-small'],
    registration: 'fits',
  },
  {
    id: 'scientific/npy/int16-2x3',
    domain: 'scientific',
    family: 'npy',
    generator: 'npy',
    title: 'NPY version 1 int16 array',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.gray',
      'compression.none',
      'endian.little',
    ],
    collections: ['smoke', 'scientific-small'],
    registration: 'npy',
  },
  {
    id: 'scientific/nrrd/int16-3x2',
    domain: 'scientific',
    family: 'nrrd',
    generator: 'nrrd',
    title: 'NRRD raw int16 array',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.gray',
      'compression.none',
      'endian.little',
    ],
    collections: ['smoke', 'scientific-small'],
    registration: 'nrrd',
  },
  {
    id: 'scientific/mrc/int16-3x2',
    domain: 'scientific',
    family: 'mrc',
    generator: 'mrc',
    title: 'MRC mode 1 int16 volume',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.gray',
      'compression.none',
      'endian.little',
      'axes.xyz',
    ],
    collections: ['smoke', 'scientific-small'],
    registration: 'mrc',
  },
  {
    id: 'scientific/nifti/nifti-1-int16',
    domain: 'scientific',
    family: 'nifti',
    generator: 'nifti',
    parameters: { version: 1 },
    title: 'NIfTI-1 single-file int16',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.gray',
      'compression.none',
      'endian.little',
      'axes.xyz',
    ],
    collections: ['smoke', 'scientific-small'],
    registration: 'nifti',
  },
  {
    id: 'scientific/nifti/nifti-2-int16',
    domain: 'scientific',
    family: 'nifti',
    generator: 'nifti',
    parameters: { version: 2 },
    title: 'NIfTI-2 single-file int16',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.gray',
      'compression.none',
      'endian.little',
      'axes.xyz',
    ],
    collections: ['smoke', 'scientific-small'],
    registration: 'nifti',
  },
  {
    id: 'scientific/gsf/float32-3x2',
    domain: 'scientific',
    family: 'gsf',
    generator: 'gsf',
    title: 'Gwyddion Simple Field float32',
    features: [
      'image.bit-depth.32',
      'image.sample.float',
      'image.color.gray',
      'compression.none',
      'endian.little',
    ],
    collections: ['smoke', 'scientific-small'],
    registration: 'gsf',
  },
  {
    id: 'scientific/nanonis-sxm/float32-3x2',
    domain: 'scientific',
    family: 'nanonis-sxm',
    generator: 'nanonis-sxm',
    title: 'Nanonis SXM float32 scan',
    features: [
      'image.bit-depth.32',
      'image.sample.float',
      'image.color.gray',
      'compression.none',
      'endian.big',
    ],
    collections: ['smoke', 'scientific-small'],
    registration: 'nanonis-sxm',
  },
  {
    id: 'scientific/cbf/uint8-3x2',
    domain: 'scientific',
    family: 'cbf',
    generator: 'cbf',
    title: 'CBF uncompressed uint8 array',
    features: [
      'image.bit-depth.8',
      'image.sample.unsigned',
      'image.color.gray',
      'compression.none',
      'endian.little',
    ],
    collections: ['smoke', 'scientific-small'],
    registration: 'cbf',
  },
  {
    id: 'scientific/x3p/float32-3x2',
    domain: 'scientific',
    family: 'x3p',
    generator: 'x3p',
    title: 'X3P archive float32 surface',
    layout: 'archive',
    features: [
      'image.bit-depth.32',
      'image.sample.float',
      'image.color.gray',
      'compression.zip',
      'endian.little',
      'layout.archive',
    ],
    collections: ['smoke', 'scientific-small', 'directory-formats'],
    registration: 'x3p',
  },
  {
    id: 'scientific/ome-tiff/uint8-2x2',
    domain: 'scientific',
    family: 'ome-tiff',
    generator: 'ome-tiff',
    title: 'OME-TIFF uint8 image',
    features: [
      'image.bit-depth.8',
      'image.sample.unsigned',
      'image.color.gray',
      'compression.none',
      'endian.little',
      'metadata.ome-xml',
    ],
    collections: ['smoke', 'scientific-small'],
    registration: 'ome-tiff',
  },
  {
    id: 'scientific/ome-zarr/int16-2x3',
    domain: 'scientific',
    family: 'ome-zarr',
    generator: 'ome-zarr',
    title: 'OME-Zarr v3 directory array',
    layout: 'directory-tree',
    entrypoint: 'zarr.json',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.gray',
      'compression.none',
      'endian.little',
      'layout.directory-tree',
      'directory-tree',
      'axes.xy',
    ],
    collections: ['smoke', 'scientific-small', 'directory-formats', 'large-range'],
    registration: 'ome-zarr',
  },
  {
    id: 'scientific/envi/bsq-int16',
    domain: 'scientific',
    family: 'envi',
    generator: 'envi',
    parameters: { interleave: 'bsq', offset: 1000 },
    title: 'Scientific ENVI BSQ companion pair',
    layout: 'companion-set',
    entrypoint: 'tiny-bsq.hdr',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.multiband',
      'compression.none',
      'endian.little',
      'layout.companion-set',
      'companion-files',
      'interleave.bsq',
    ],
    collections: ['smoke', 'scientific-small', 'directory-formats'],
    registration: 'envi',
  },
  {
    id: 'geo/geotiff/wgs84-2x2',
    domain: 'geo',
    family: 'geotiff',
    generator: 'geotiff',
    title: 'GeoTIFF WGS84 affine grid',
    features: [
      'image.bit-depth.8',
      'image.sample.unsigned',
      'image.color.gray',
      'compression.none',
      'endian.little',
      'geo.crs',
      'geo.affine',
    ],
    collections: ['smoke', 'geo-small', 'large-range'],
    registration: 'geotiff',
  },
  {
    id: 'geo/world-file/png-affine',
    domain: 'geo',
    family: 'image-world-file',
    generator: 'png-world',
    title: 'PNG plus world file affine transform',
    layout: 'companion-set',
    entrypoint: 'map.png',
    features: [
      'image.bit-depth.8',
      'image.sample.unsigned',
      'image.color.rgba',
      'compression.deflate',
      'layout.companion-set',
      'companion-files',
      'geo.affine',
    ],
    collections: ['smoke', 'geo-small', 'directory-formats'],
    registration: 'image-world-file',
  },
  {
    id: 'geo/esri-ascii-grid/tiny',
    domain: 'geo',
    family: 'esri-ascii-grid',
    generator: 'esri-ascii-grid',
    title: 'Esri ASCII Grid with NODATA',
    features: [
      'image.bit-depth.text',
      'image.sample.signed',
      'image.color.gray',
      'compression.none',
      'geo.affine',
      'geo.nodata',
    ],
    collections: ['smoke', 'geo-small'],
    registration: 'esri-ascii-grid',
  },
  {
    id: 'geo/srtm-hgt/n00e000-1201',
    domain: 'geo',
    family: 'srtm-hgt',
    generator: 'srtm-hgt',
    title: 'SRTM HGT 1201 by 1201 tile',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.gray',
      'compression.none',
      'endian.big',
      'geo.filename-location',
    ],
    collections: ['smoke', 'geo-small', 'large-range'],
    registration: 'srtm-hgt',
  },
  {
    id: 'geo/geozarr/int16-2x3',
    domain: 'geo',
    family: 'geozarr',
    generator: 'geozarr',
    title: 'GeoZarr v3 directory array',
    layout: 'directory-tree',
    entrypoint: 'zarr.json',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.gray',
      'compression.none',
      'endian.little',
      'layout.directory-tree',
      'directory-tree',
      'geo.crs',
      'geo.affine',
    ],
    collections: ['smoke', 'geo-small', 'directory-formats', 'large-range'],
    registration: 'geozarr',
  },
  {
    id: 'geo/envi/bil-int16',
    domain: 'geo',
    family: 'geo-envi',
    generator: 'envi',
    parameters: { interleave: 'bil' },
    title: 'Geo-ENVI BIL companion pair',
    layout: 'companion-set',
    entrypoint: 'tiny-bil.hdr',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.multiband',
      'compression.none',
      'endian.little',
      'layout.companion-set',
      'companion-files',
      'interleave.bil',
      'geo.crs',
    ],
    collections: ['smoke', 'geo-small', 'directory-formats'],
    registration: 'geo-envi',
  },
  {
    id: 'geo/envi/bip-int16',
    domain: 'geo',
    family: 'geo-envi',
    generator: 'envi',
    parameters: { interleave: 'bip' },
    title: 'Geo-ENVI BIP companion pair',
    layout: 'companion-set',
    entrypoint: 'tiny-bip.hdr',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.multiband',
      'compression.none',
      'endian.little',
      'layout.companion-set',
      'companion-files',
      'interleave.bip',
      'geo.crs',
    ],
    collections: ['smoke', 'geo-small', 'directory-formats'],
    registration: 'geo-envi',
  },
  {
    id: 'geo/envi/bsq-int16',
    domain: 'geo',
    family: 'geo-envi',
    generator: 'envi',
    parameters: { interleave: 'bsq' },
    title: 'Geo-ENVI BSQ companion pair',
    layout: 'companion-set',
    entrypoint: 'tiny-bsq.hdr',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.multiband',
      'compression.none',
      'endian.little',
      'layout.companion-set',
      'companion-files',
      'interleave.bsq',
      'geo.crs',
    ],
    collections: ['geo-small', 'directory-formats'],
    registration: 'geo-envi',
  },
  {
    id: 'geo/netcdf/classic-int16',
    domain: 'geo',
    family: 'netcdf-classic',
    generator: 'classic-netcdf',
    title: 'Classic NetCDF int16 grid',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.gray',
      'compression.none',
      'endian.big',
      'axes.xy',
    ],
    collections: ['smoke', 'geo-small'],
    registration: 'netcdf-cf',
  },
  {
    id: 'geo/netcdf/cf-latlon-int16',
    domain: 'geo',
    family: 'netcdf-cf',
    generator: 'cf-netcdf',
    title: 'CF 1.8 latitude-longitude grid',
    features: [
      'image.bit-depth.16',
      'image.sample.signed',
      'image.color.gray',
      'compression.none',
      'endian.big',
      'axes.xy',
      'geo.crs',
      'metadata.cf-1.8',
    ],
    collections: ['smoke', 'geo-small'],
    registration: 'netcdf-cf',
  },
];

const rosettaBase =
  'https://raw.githubusercontent.com/hyperspy/rosettasciio/bc254db14cd7d4d23169b11aeb622a0a7eac1fbe/rsciio/tests/data/';
const externalSeeds: ExternalSeed[] = [
  {
    id: 'ordinary/libjpeg-turbo/testorig',
    domain: 'ordinary',
    family: 'jpeg',
    sourceId: 'libjpeg-turbo',
    title: 'libjpeg-turbo testorig reference image',
    baseUrl:
      'https://raw.githubusercontent.com/libjpeg-turbo/libjpeg-turbo/1157d37cfab977f8f7f8344aededdfd951222c89/',
    originalUrl:
      'https://github.com/libjpeg-turbo/libjpeg-turbo/blob/1157d37cfab977f8f7f8344aededdfd951222c89/testimages/testorig.jpg',
    files: [
      {
        path: 'testorig.jpg',
        role: 'primary',
        sourcePath: 'testimages/testorig.jpg',
        bytes: 5770,
        sha256: 'acc6ec555d41d15b368320edaa3b20958ee6fa97cb6e4a18d1213d5ae8bec73b',
      },
    ],
    registration: 'jpeg',
  },
  {
    id: 'ordinary/libwebp/lossless1',
    domain: 'ordinary',
    family: 'webp',
    sourceId: 'libwebp-test-data',
    title: 'libwebp lossless reference image',
    baseUrl:
      'https://raw.githubusercontent.com/webmproject/libwebp-test-data/06ddd96e276c2c638a72d39d3c0f340afd61978c/',
    originalUrl:
      'https://github.com/webmproject/libwebp-test-data/blob/06ddd96e276c2c638a72d39d3c0f340afd61978c/lossless1.webp',
    files: [
      {
        path: 'lossless1.webp',
        role: 'primary',
        sourcePath: 'lossless1.webp',
        bytes: 15368,
        sha256: '5eaf3d3e7f7a38487afa8d3f91062167eb061cd6a5dfa455d24a9a2004860311',
      },
    ],
    registration: 'webp',
  },
  {
    id: 'ordinary/libavif/irot-alpha',
    domain: 'ordinary',
    family: 'avif',
    sourceId: 'libavif',
    title: 'libavif rotation and alpha case',
    baseUrl:
      'https://raw.githubusercontent.com/AOMediaCodec/libavif/eb673097950e0b0ec77f696958091ef0244a45a9/',
    originalUrl:
      'https://github.com/AOMediaCodec/libavif/blob/eb673097950e0b0ec77f696958091ef0244a45a9/tests/data/abc_color_irot_alpha_irot.avif',
    files: [
      {
        path: 'abc_color_irot_alpha_irot.avif',
        role: 'primary',
        sourcePath: 'tests/data/abc_color_irot_alpha_irot.avif',
        bytes: 10597,
        sha256: 'b371cc88244a873131e4d10ff9363d71ce4f41cf333bd4a491b38d970d9abd3b',
      },
    ],
    registration: 'avif',
  },
  {
    id: 'ordinary/libheif/example-heic',
    domain: 'ordinary',
    family: 'heic',
    sourceId: 'libheif',
    title: 'libheif example HEIC',
    baseUrl:
      'https://raw.githubusercontent.com/strukturag/libheif/2bc82b493dd8896fab3226f01977c7ac9d2ea3b8/',
    originalUrl:
      'https://github.com/strukturag/libheif/blob/2bc82b493dd8896fab3226f01977c7ac9d2ea3b8/examples/example.heic',
    files: [
      {
        path: 'example.heic',
        role: 'primary',
        sourcePath: 'examples/example.heic',
        bytes: 718114,
        sha256: '7f8b363e4936c0666a25f64f3a92fda10bd8e5453be4592530b65a55dd98f3f2',
      },
    ],
    registration: 'heic',
  },
  {
    id: 'ordinary/openjpeg/file1-jp2',
    domain: 'ordinary',
    family: 'jp2',
    sourceId: 'openjpeg-data',
    title: 'OpenJPEG conformance file1 JP2',
    baseUrl:
      'https://raw.githubusercontent.com/uclouvain/openjpeg-data/39524bd3a601d90ed8e0177559400d23945f96a9/',
    originalUrl:
      'https://github.com/uclouvain/openjpeg-data/blob/39524bd3a601d90ed8e0177559400d23945f96a9/input/conformance/file1.jp2',
    files: [
      {
        path: 'file1.jp2',
        role: 'primary',
        sourcePath: 'input/conformance/file1.jp2',
        bytes: 650678,
        sha256: '4e3d51df7bc66cf367162acfff88b0889d2b2c79ea8d99d93b2d2bd165398deb',
      },
    ],
    registration: 'jp2',
  },
  {
    id: 'ordinary/libjxl/jpeg-reconstruction-1x1',
    domain: 'ordinary',
    family: 'jpeg-xl',
    sourceId: 'libjxl-testdata',
    title: 'libjxl 1 by 1 JPEG reconstruction case',
    baseUrl:
      'https://raw.githubusercontent.com/libjxl/testdata/73695d303670c90e4d506ea89d9901b081385089/',
    originalUrl:
      'https://github.com/libjxl/testdata/blob/73695d303670c90e4d506ea89d9901b081385089/jxl/jpeg_reconstruction/1x1_exif_xmp.jxl',
    files: [
      {
        path: '1x1_exif_xmp.jxl',
        role: 'primary',
        sourcePath: 'jxl/jpeg_reconstruction/1x1_exif_xmp.jxl',
        bytes: 4104,
        sha256: '30966de3d58f38a4b9f29a26483f5839b32c283c69552cf5d6aa1ec18e5f77b2',
      },
    ],
    registration: 'jpeg-xl',
  },
  {
    id: 'ordinary/imazen/apng-two-frame',
    domain: 'ordinary',
    family: 'png',
    sourceId: 'imazen-codec-corpus',
    title: 'Imazen generated two-frame APNG',
    baseUrl:
      'https://raw.githubusercontent.com/imazen/codec-corpus/4fdbdf17909594c1ea96bd879d1785ef507161d0/',
    originalUrl:
      'https://github.com/imazen/codec-corpus/blob/4fdbdf17909594c1ea96bd879d1785ef507161d0/apng-conformance/valid/2frame_simple.png',
    files: [
      {
        path: '2frame_simple.png',
        role: 'primary',
        sourcePath: 'apng-conformance/valid/2frame_simple.png',
        bytes: 204,
        sha256: '204102f7af480f98e34884d37fdd9ce16aa4af2c51b1d7b97bc3b76f13c61113',
      },
    ],
    registration: 'png',
    rights: {
      spdx: 'CC0-1.0',
      licenseName: 'CC0 1.0 Universal',
      evidenceUrl:
        'https://github.com/imazen/codec-corpus/blob/4fdbdf17909594c1ea96bd879d1785ef507161d0/README.md',
      attribution: 'Generated by Imazen codec-corpus',
      redistribution: 'allowed',
    },
  },
  {
    id: 'ordinary/imazen/gif-1x1',
    domain: 'ordinary',
    family: 'gif',
    sourceId: 'imazen-codec-corpus',
    title: 'Imazen generated GIF 1 by 1',
    baseUrl:
      'https://raw.githubusercontent.com/imazen/codec-corpus/4fdbdf17909594c1ea96bd879d1785ef507161d0/',
    originalUrl:
      'https://github.com/imazen/codec-corpus/blob/4fdbdf17909594c1ea96bd879d1785ef507161d0/gif-conformance/valid/1x1.gif',
    files: [
      {
        path: '1x1.gif',
        role: 'primary',
        sourcePath: 'gif-conformance/valid/1x1.gif',
        bytes: 43,
        sha256: 'e4c8efe0cd4a34ef45c313760fe5bd92c0d0d61cf444ca99d53519d9d3657608',
      },
    ],
    registration: 'gif',
    rights: {
      spdx: 'CC0-1.0',
      licenseName: 'CC0 1.0 Universal',
      evidenceUrl:
        'https://github.com/imazen/codec-corpus/blob/4fdbdf17909594c1ea96bd879d1785ef507161d0/README.md',
      attribution: 'Generated by Imazen codec-corpus',
      redistribution: 'allowed',
    },
  },
  {
    id: 'ordinary/imazen/pbm-1x1',
    domain: 'ordinary',
    family: 'pbm',
    sourceId: 'imazen-codec-corpus',
    title: 'Imazen generated PBM 1 by 1',
    baseUrl:
      'https://raw.githubusercontent.com/imazen/codec-corpus/4fdbdf17909594c1ea96bd879d1785ef507161d0/',
    originalUrl:
      'https://github.com/imazen/codec-corpus/blob/4fdbdf17909594c1ea96bd879d1785ef507161d0/pnm-conformance/valid/pbm/1x1_black_ascii.pbm',
    files: [
      {
        path: '1x1_black_ascii.pbm',
        role: 'primary',
        sourcePath: 'pnm-conformance/valid/pbm/1x1_black_ascii.pbm',
        bytes: 9,
        sha256: '4b27344ec7524986ebaaff41983e258fdda048382154588334592cbf85878389',
      },
    ],
    registration: 'netpbm',
    rights: {
      spdx: 'CC0-1.0',
      licenseName: 'CC0 1.0 Universal',
      evidenceUrl:
        'https://github.com/imazen/codec-corpus/blob/4fdbdf17909594c1ea96bd879d1785ef507161d0/README.md',
      attribution: 'Generated by Imazen codec-corpus',
      redistribution: 'allowed',
    },
  },
  {
    id: 'scientific/aperio-svs/cmu-small-region',
    family: 'aperio-svs',
    sourceId: 'openslide-testdata',
    title: 'Aperio CMU small region slide',
    baseUrl: 'https://openslide.cs.cmu.edu/download/openslide-testdata/Aperio/',
    originalUrl:
      'https://openslide.cs.cmu.edu/download/openslide-testdata/Aperio/CMU-1-Small-Region.svs',
    files: [
      {
        path: 'CMU-1-Small-Region.svs',
        role: 'primary',
        sourcePath: 'CMU-1-Small-Region.svs',
        bytes: 1938955,
        sha256: 'ed92d5a9f2e86df67640d6f92ce3e231419ce127131697fbbce42ad5e002c8a7',
      },
    ],
    registration: 'aperio-svs',
    privacy: {
      reviewStatus: 'pending',
      containsHumanData: true,
      phi: 'unknown',
      burnedInText: 'unknown',
      gps: 'none',
      faces: 'none',
      deidentified: 'unknown',
      notes: ['Kept external until specimen provenance and slide-label privacy are reviewed.'],
    },
  },
  {
    id: 'scientific/blockfile/test1',
    family: 'blockfile',
    sourceId: 'rosettasciio',
    title: 'RosettaSciIO blockfile test1',
    baseUrl: rosettaBase,
    originalUrl: `${rosettaBase}blockfile/test1.blo`,
    files: [
      {
        path: 'test1.blo',
        role: 'primary',
        sourcePath: 'blockfile/test1.blo',
        bytes: 128564,
        sha256: 'df2c77ba0957f186a7681b6af07493a5cee01d08662db39200112909fefe745e',
      },
    ],
    registration: 'blockfile',
  },
  {
    id: 'scientific/digital-micrograph/dm3-test1',
    family: 'dm3',
    sourceId: 'rosettasciio',
    title: 'DigitalMicrograph DM3 test1',
    baseUrl: rosettaBase,
    originalUrl: `${rosettaBase}digitalmicrograph/1D/test-1.dm3`,
    files: [
      {
        path: 'test-1.dm3',
        role: 'primary',
        sourcePath: 'digitalmicrograph/1D/test-1.dm3',
        bytes: 49475,
        sha256: '1415584aeadae829aba952c580a9683fefe2772d59d5e222d7ec227d3bb8693e',
      },
    ],
    registration: 'digital-micrograph',
  },
  {
    id: 'scientific/digital-micrograph/dm4-test1',
    family: 'dm4',
    sourceId: 'rosettasciio',
    title: 'DigitalMicrograph DM4 test1',
    baseUrl: rosettaBase,
    originalUrl: `${rosettaBase}digitalmicrograph/1D/test-1.dm4`,
    files: [
      {
        path: 'test-1.dm4',
        role: 'primary',
        sourcePath: 'digitalmicrograph/1D/test-1.dm4',
        bytes: 306306,
        sha256: 'ba470b29e4406d697179914a661b2c7bc58d0d7b9fe8825290f29b4fdfcf57c8',
      },
    ],
    registration: 'digital-micrograph',
  },
  {
    id: 'scientific/digital-surf/test-surface',
    family: 'digital-surf',
    sourceId: 'rosettasciio',
    title: 'Digital Surf surface',
    baseUrl: rosettaBase,
    originalUrl: `${rosettaBase}digitalsurf/test_surface.sur`,
    files: [
      {
        path: 'test_surface.sur',
        role: 'primary',
        sourcePath: 'digitalsurf/test_surface.sur',
        bytes: 56141,
        sha256: '6ed59a9a235c0b6dc7e15f155d0e738c5841cfc0fe78f1861b7e145f9dcaadf4',
      },
    ],
    registration: 'digital-surf',
  },
  {
    id: 'scientific/emsa/example1',
    family: 'emsa',
    sourceId: 'rosettasciio',
    title: 'EMSA MSA spectrum example',
    baseUrl: rosettaBase,
    originalUrl: `${rosettaBase}msa/example1.msa`,
    files: [
      {
        path: 'example1.msa',
        role: 'primary',
        sourcePath: 'msa/example1.msa',
        bytes: 1064,
        sha256: '2dcb6d372cbbf1ce90ad64e4f155080ac0b322f8680fe5de8fc14ea1548e596f',
      },
    ],
    registration: 'emsa',
  },
  {
    id: 'scientific/mrc/rosetta-int16',
    family: 'mrc',
    sourceId: 'rosettasciio',
    title: 'RosettaSciIO MRC int16',
    baseUrl: rosettaBase,
    originalUrl: `${rosettaBase}mrc/20241021_00405_0_Virt%200_sum.mrc`,
    files: [
      {
        path: 'virt0.mrc',
        role: 'primary',
        sourcePath: 'mrc/20241021_00405_0_Virt%200_sum.mrc',
        bytes: 1152,
        sha256: '3f798cf43ff1f3c39750b379a22962a4c6d2d546f1298461fabc6bced0cc876f',
      },
    ],
    registration: 'mrc',
  },
  {
    id: 'scientific/ncem-emd/si100',
    family: 'ncem-emd',
    sourceId: 'rosettasciio',
    title: 'NCEM EMD Si100 array',
    baseUrl: rosettaBase,
    originalUrl: `${rosettaBase}emd/Si100_1x1x3-zStart5.43.emd`,
    files: [
      {
        path: 'Si100.emd',
        role: 'primary',
        sourcePath: 'emd/Si100_1x1x3-zStart5.43.emd',
        bytes: 158144,
        sha256: 'eea3f9bb5a3bdbca0a3f4c498c3c866aafec2ced06de1964cf0b904a48cab1c1',
      },
    ],
    registration: 'ncem-emd',
  },
  {
    id: 'scientific/tia-ser/tem-search',
    family: 'tia-ser',
    sourceId: 'rosettasciio',
    title: 'TIA SER TEM search image',
    baseUrl: rosettaBase,
    originalUrl: `${rosettaBase}tia/new/128x128-TEM_search_1.ser`,
    files: [
      {
        path: '128x128-TEM_search_1.ser',
        role: 'primary',
        sourcePath: 'tia/new/128x128-TEM_search_1.ser',
        bytes: 65682,
        sha256: '8b79f81363d41f759ecda84fb91d50463e2a828f532d5b8f9378960e57fc3ae7',
      },
    ],
    registration: 'tia-ser',
  },
  {
    id: 'scientific/tia-emi/tem-search-pair',
    family: 'tia-emi',
    sourceId: 'rosettasciio',
    title: 'TIA EMI plus SER companion set',
    baseUrl: rosettaBase,
    originalUrl: `${rosettaBase}tia/new/128x128-TEM_search.emi`,
    layout: 'companion-set',
    entrypoint: '128x128-TEM_search.emi',
    files: [
      {
        path: '128x128-TEM_search.emi',
        role: 'header',
        sourcePath: 'tia/new/128x128-TEM_search.emi',
        bytes: 73562,
        sha256: '0b0a18b5b6eeb166e0b363f5f7737003b6308f5c523b2d063c3f38bd66235f89',
      },
      {
        path: '128x128-TEM_search_1.ser',
        role: 'payload',
        sourcePath: 'tia/new/128x128-TEM_search_1.ser',
        bytes: 65682,
        sha256: '8b79f81363d41f759ecda84fb91d50463e2a828f532d5b8f9378960e57fc3ae7',
      },
    ],
    registration: 'tia-emi',
  },
  {
    id: 'scientific/rpl/rosetta-float32',
    family: 'rpl',
    sourceId: 'rosettasciio',
    title: 'RosettaSciIO RPL plus RAW float32',
    baseUrl: rosettaBase,
    originalUrl: `${rosettaBase}ripple/test_ripple_sdim-1_ndim-0_float32.rpl`,
    layout: 'companion-set',
    entrypoint: 'float32.rpl',
    files: [
      {
        path: 'float32.rpl',
        role: 'header',
        sourcePath: 'ripple/test_ripple_sdim-1_ndim-0_float32.rpl',
        bytes: 352,
        sha256: 'd3501a261506fa49f362effe44397ed2f3e1e4f18ba203fbf0e80239b0437082',
      },
      {
        path: 'float32.raw',
        role: 'payload',
        sourcePath: 'ripple/test_ripple_sdim-1_ndim-0_float32.raw',
        bytes: 12,
        sha256: '75664b4da1c08de9e8fad52303cc458b3e420edde6591e58761e138cc5e3f163',
      },
    ],
    registration: 'rpl',
  },
  {
    id: 'scientific/velox-emd/version11-archive',
    family: 'velox-emd',
    sourceId: 'rosettasciio',
    title: 'Velox EMD version 11 archive',
    baseUrl: rosettaBase,
    originalUrl: `${rosettaBase}emd/velox_emd_version11.zip`,
    layout: 'archive',
    files: [
      {
        path: 'velox_emd_version11.zip',
        role: 'archive',
        sourcePath: 'emd/velox_emd_version11.zip',
        bytes: 147888,
        sha256: '125f0f6b1517e6bb2a1c44f2157b874fe244bb7716f37a9efbda853f16e395c1',
      },
    ],
    registration: 'velox-emd',
  },
  {
    id: 'scientific/dicom/obxxxx1a',
    family: 'dicom',
    sourceId: 'pydicom-data',
    title: 'pydicom OBXXXX1A fixture',
    baseUrl:
      'https://raw.githubusercontent.com/pydicom/pydicom-data/abc42b90985fb6cf385aa4af766d2c9c94a257a4/data_store/data/',
    originalUrl:
      'https://github.com/pydicom/pydicom-data/blob/abc42b90985fb6cf385aa4af766d2c9c94a257a4/data_store/data/OBXXXX1A.dcm',
    files: [
      {
        path: 'OBXXXX1A.dcm',
        role: 'primary',
        sourcePath: 'OBXXXX1A.dcm',
        bytes: 486008,
        sha256: '164a460bebdc15fbe391ad4bfe4c84672eb2bad57adfe7dad372fd7367b0f63e',
      },
    ],
    registration: 'dicom',
    privacy: {
      reviewStatus: 'pending',
      containsHumanData: true,
      phi: 'unknown',
      burnedInText: 'unknown',
      gps: 'unknown',
      faces: 'unknown',
      deidentified: 'unknown',
      notes: ['Kept external until an explicit tag and pixel privacy review passes.'],
    },
  },
  {
    id: 'geo/netcdf/netcdf4-grouped',
    domain: 'geo',
    family: 'netcdf-4',
    sourceId: 'unidata-netcdf-c',
    title: 'Grouped NetCDF-4 reference file',
    baseUrl:
      'https://raw.githubusercontent.com/Unidata/netcdf-c/2ed1b285b9c9dbac7de2c7d330e576be16dcade8/',
    originalUrl:
      'https://github.com/Unidata/netcdf-c/blob/2ed1b285b9c9dbac7de2c7d330e576be16dcade8/ncdump/ref_nc_test_netcdf4_4_0.nc',
    files: [
      {
        path: 'grouped-netcdf4.nc',
        role: 'primary',
        sourcePath: 'ncdump/ref_nc_test_netcdf4_4_0.nc',
        bytes: 162812,
        sha256: 'e26bf7b74caee704c7420b4b983d27c3717e739652e5a8ac0c8f2a52c16d073e',
      },
    ],
    registration: 'netcdf-cf',
  },
];

function mediaType(path: string): string {
  const extension = extname(path).slice(1).toLowerCase();
  return (
    (
      {
        png: 'image/png',
        tiff: 'image/tiff',
        tif: 'image/tiff',
        qoi: 'image/qoi',
        hdr: 'image/vnd.radiance',
        ico: 'image/x-icon',
        dcm: 'application/dicom',
        json: 'application/json',
        nc: 'application/x-netcdf',
        npy: 'application/x-npy',
      } as Record<string, string>
    )[extension] ?? 'application/octet-stream'
  );
}

async function generatedCases(): Promise<CorpusCase[]> {
  const cases: CorpusCase[] = [];
  for (const seed of generatedSeeds) {
    const parameters = seed.parameters ?? {};
    const files = generateFixture(seed.generator, parameters);
    const assets: CorpusCase['assets'] = [];
    for (const [index, file] of files.entries()) {
      const hash = sha256(file.bytes);
      const path = vendoredBlobPath(hash, root);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.bytes);
      assets.push({
        path: file.path,
        role:
          index === 0
            ? seed.layout === 'archive'
              ? 'archive'
              : seed.layout === 'directory-tree'
                ? 'directory-object'
                : seed.layout === 'companion-set'
                  ? 'header'
                  : 'primary'
            : seed.layout === 'directory-tree'
              ? 'directory-object'
              : 'payload',
        storage: 'generated',
        sourceId: generatedSourceId,
        sourcePath: `recipes/generated/${seed.id.replaceAll('/', '-')}.json`,
        bytes: file.bytes.byteLength,
        sha256: hash,
        mediaType: mediaType(file.path),
      });
    }
    const entrypoint = seed.entrypoint ?? files[0]?.path;
    if (!entrypoint) throw new Error(`No generated files for ${seed.id}`);
    const allFeatures = [
      ...new Set([
        ...commonFeatures,
        ...seed.features,
        `format.${seed.family}`,
        `purejsimage.reader.${seed.registration}`,
        `layout.${seed.layout ?? 'single-file'}`,
        'http.range',
      ]),
    ].sort();
    const corpusCase: CorpusCase = {
      schemaVersion: 1,
      id: seed.id,
      caseRevision: 1,
      title: seed.title,
      description: `${seed.title}, written by the transparent generator ${seed.generator}.`,
      domain: seed.domain,
      format: {
        family: seed.family,
        extensions: [
          ...new Set(files.map((file) => extname(file.path).slice(1).toLowerCase() || 'bin')),
        ].sort(),
        mediaTypes: [...new Set(files.map((file) => mediaType(file.path)))].sort(),
        features: allFeatures,
      },
      layout: {
        kind: seed.layout ?? 'single-file',
        entrypoint,
        requiredPaths: files.map((file) => file.path).sort(),
      },
      assets,
      provenance: {
        sourceId: generatedSourceId,
        originalUrl: 'https://github.com/a-r-d/purejsimage-corpus',
        resolvedAt,
        method: 'generated',
      },
      rights: {
        spdx: 'CC0-1.0',
        licenseName: 'CC0 1.0 Universal',
        evidenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution: 'Generated by purejsimage-corpus',
        redistribution: 'allowed',
      },
      privacy: privacyNotRequired(),
      expected: expected(
        'valid',
        'success',
        { generator: seed.generator },
        assets.reduce((sum, asset) => sum + asset.bytes, 0),
      ),
      coverage: {
        features: allFeatures,
        selectionReason: `Provides a small independently written ${seed.family} case for ${seed.registration}.`,
        priority: 'high',
      },
      collections: seed.collections,
      notes: ['The generator is independent of PureJsImage codec implementations.'],
    };
    cases.push(corpusCase);
    await writeJson(join(root, 'recipes/generated', `${seed.id.replaceAll('/', '-')}.json`), {
      schemaVersion: 1,
      id: `generated/${seed.id.replaceAll('/', '-')}`,
      kind: 'generated',
      caseId: seed.id,
      description: `Deterministically generate ${seed.title}.`,
      generator: seed.generator,
      parameters,
    });
  }
  return cases;
}

function externalCases(): CorpusCase[] {
  return externalSeeds.map((seed) => {
    const kind = seed.layout ?? 'single-file';
    const entrypoint = seed.entrypoint ?? seed.files[0]?.path;
    if (!entrypoint) throw new Error(`No external files for ${seed.id}`);
    const features = [
      ...new Set([
        ...commonFeatures,
        `format.${seed.family}`,
        `purejsimage.reader.${seed.registration}`,
        `layout.${kind}`,
        'http.range',
        ...(kind === 'companion-set' ? ['companion-files'] : []),
        ...(kind === 'archive' ? ['compression.zip'] : []),
      ]),
    ].sort();
    return {
      schemaVersion: 1,
      id: seed.id,
      caseRevision: 1,
      title: seed.title,
      description: `${seed.title}, pinned by SHA-256 and exact upstream revision where available.`,
      domain: seed.domain ?? 'scientific',
      format: {
        family: seed.family,
        extensions: [
          ...new Set(seed.files.map((file) => extname(file.path).slice(1).toLowerCase())),
        ].sort(),
        mediaTypes: [...new Set(seed.files.map((file) => mediaType(file.path)))].sort(),
        features,
      },
      layout: { kind, entrypoint, requiredPaths: seed.files.map((file) => file.path).sort() },
      assets: seed.files.map((file) => ({
        path: file.path,
        role: file.role,
        storage: 'external',
        sourceId: seed.sourceId,
        sourcePath: file.sourcePath,
        resolvedUrl: `${seed.baseUrl}${file.sourcePath}`,
        bytes: file.bytes,
        sha256: file.sha256,
        mediaType: mediaType(file.path),
      })),
      provenance: {
        sourceId: seed.sourceId,
        originalUrl: seed.originalUrl,
        resolvedAt,
        method: 'downloaded',
      },
      rights: seed.rights ?? {
        licenseName: 'Asset license not established',
        evidenceUrl:
          sources.find((sourceRecord) => sourceRecord.id === seed.sourceId)?.homepage ??
          seed.originalUrl,
        attribution: 'See upstream source metadata.',
        redistribution: 'unknown',
      },
      privacy: seed.privacy ?? privacyNotRequired(),
      expected: expected(
        'valid',
        'success',
        {},
        seed.files.reduce((sum, file) => sum + file.bytes, 0),
      ),
      coverage: {
        features,
        selectionReason: `Exercises the real ${seed.registration} reader with independently hashed upstream bytes.`,
        priority: 'high',
      },
      collections: [
        seed.domain === 'geo'
          ? 'geo-small'
          : seed.domain === 'ordinary'
            ? 'ordinary-conformance'
            : 'scientific-small',
        'large-range',
        ...(kind !== 'single-file' ? ['directory-formats'] : []),
      ],
      notes: [
        seed.rights?.redistribution === 'allowed'
          ? 'Kept external to keep the committed ordinary seed small; redistribution evidence is recorded.'
          : 'External because asset-level redistribution rights are not established.',
      ],
      ...(seed.id === 'scientific/tia-emi/tem-search-pair'
        ? {
            relationships: [{ type: 'parent' as const, caseId: 'scientific/tia-ser/tem-search' }],
          }
        : {}),
    };
  });
}

const negativeSeeds: NegativeSeed[] = [
  {
    id: 'negative/qoi/truncated-header',
    parentId: 'ordinary/qoi/rgba-2x2',
    targetPath: 'rgba-2x2.qoi',
    description: 'Truncate inside the QOI header.',
    feature: 'negative.truncated-header',
    operations: [{ op: 'truncate', length: 10 }],
  },
  {
    id: 'negative/qoi/truncated-payload',
    parentId: 'ordinary/qoi/rgba-2x2',
    targetPath: 'rgba-2x2.qoi',
    description: 'Truncate after the first QOI pixel.',
    feature: 'negative.truncated-payload',
    operations: [{ op: 'truncate', length: 19 }],
  },
  {
    id: 'negative/qoi/invalid-magic',
    parentId: 'ordinary/qoi/rgba-2x2',
    targetPath: 'rgba-2x2.qoi',
    description: 'Replace the QOI magic bytes.',
    feature: 'negative.invalid-magic',
    operations: [{ op: 'overwrite-bytes', offset: 0, bytesHex: '00000000' }],
  },
  {
    id: 'negative/qoi/zero-dimensions',
    parentId: 'ordinary/qoi/rgba-2x2',
    targetPath: 'rgba-2x2.qoi',
    description: 'Set both QOI dimensions to zero.',
    feature: 'negative.zero-dimensions',
    operations: [{ op: 'overwrite-bytes', offset: 4, bytesHex: '0000000000000000' }],
  },
  {
    id: 'negative/qoi/dimension-limit',
    parentId: 'ordinary/qoi/rgba-2x2',
    targetPath: 'rgba-2x2.qoi',
    description: 'Declare a width above configured limits.',
    feature: 'negative.dimension-limit',
    operations: [{ op: 'patch-u32-be', offset: 4, value: 100000001 }],
  },
  {
    id: 'negative/qoi/decompression-bomb',
    parentId: 'ordinary/qoi/rgba-2x2',
    targetPath: 'rgba-2x2.qoi',
    description: 'Declare a huge square image with a tiny payload.',
    feature: 'negative.decompression-bomb',
    operations: [
      { op: 'patch-u32-be', offset: 4, value: 100000 },
      { op: 'patch-u32-be', offset: 8, value: 100000 },
    ],
  },
  {
    id: 'negative/qoi/integer-overflow',
    parentId: 'ordinary/qoi/rgba-2x2',
    targetPath: 'rgba-2x2.qoi',
    description: 'Declare dimensions whose pixel product overflows 32-bit arithmetic.',
    feature: 'negative.integer-overflow',
    operations: [
      { op: 'patch-u32-be', offset: 4, value: 4294967295 },
      { op: 'patch-u32-be', offset: 8, value: 4294967295 },
    ],
  },
  {
    id: 'negative/tiff/bad-ifd-offset',
    parentId: 'ordinary/tiff/gray-2x2',
    targetPath: 'gray-2x2.tiff',
    description: 'Point the first TIFF IFD outside the file.',
    feature: 'negative.bad-offset',
    operations: [{ op: 'patch-u32-le', offset: 4, value: 4294967295 }],
  },
  {
    id: 'negative/tiff/overlapping-regions',
    parentId: 'ordinary/tiff/gray-2x2',
    targetPath: 'gray-2x2.tiff',
    description: 'Point TIFF strip bytes into the IFD.',
    feature: 'negative.overlapping-regions',
    operations: [{ op: 'patch-u32-le', offset: 78, value: 8 }],
  },
  {
    id: 'negative/png/invalid-chunk-length',
    parentId: 'geo/world-file/png-affine',
    targetPath: 'map.png',
    description: 'Declare an impossible PNG IHDR chunk length.',
    feature: 'negative.invalid-chunk-length',
    operations: [{ op: 'patch-u32-be', offset: 8, value: 4294967295 }],
  },
  {
    id: 'negative/png/bad-checksum',
    parentId: 'geo/world-file/png-affine',
    targetPath: 'map.png',
    description: 'Flip a bit in the PNG IHDR CRC.',
    feature: 'negative.bad-checksum',
    operations: [{ op: 'flip-bit', offset: 29, bit: 0 }],
  },
  {
    id: 'negative/meta-image/missing-companion',
    parentId: 'scientific/meta-image/int16-3x2',
    targetPath: 'tiny.raw',
    description: 'Omit the RAW file named by the MHD header.',
    feature: 'negative.missing-companion',
    operations: [{ op: 'truncate', length: 0 }],
    omitOutput: true,
  },
  {
    id: 'negative/meta-image/mismatched-dimensions',
    parentId: 'scientific/meta-image/int16-3x2',
    targetPath: 'tiny.mhd',
    description: 'Change MHD dimensions without changing the RAW payload.',
    feature: 'negative.mismatched-companion-dimensions',
    operations: [{ op: 'overwrite-bytes', offset: 44, bytesHex: '392039' }],
  },
  {
    id: 'negative/geozarr/invalid-metadata',
    parentId: 'geo/geozarr/int16-2x3',
    targetPath: 'zarr.json',
    description: 'Replace the root JSON object delimiter.',
    feature: 'negative.invalid-directory-metadata',
    operations: [{ op: 'overwrite-bytes', offset: 0, bytesHex: '5b' }],
  },
  {
    id: 'negative/srtm-hgt/wrong-size',
    parentId: 'geo/srtm-hgt/n00e000-1201',
    targetPath: 'N00E000.hgt',
    description: 'Truncate an HGT tile to a nonstandard byte size.',
    feature: 'negative.wrong-size',
    operations: [{ op: 'truncate', length: 1000 }],
  },
];

async function negativeCases(parents: CorpusCase[]): Promise<CorpusCase[]> {
  const cases: CorpusCase[] = [];
  for (const seed of negativeSeeds) {
    const parent = parents.find((candidate) => candidate.id === seed.parentId);
    if (!parent) throw new Error(`Missing negative parent ${seed.parentId}`);
    const target = parent.assets.find((asset) => asset.path === seed.targetPath);
    if (!target) throw new Error(`Missing mutation target ${seed.targetPath}`);
    const parentBytes = await readFile(vendoredBlobPath(target.sha256, root));
    const mutated = applyMutations(parentBytes, seed.operations);
    const mutatedHash = sha256(mutated);
    if (!seed.omitOutput) {
      const outputPath = vendoredBlobPath(mutatedHash, root);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, mutated);
    }
    const assets = parent.assets
      .filter((asset) => !(seed.omitOutput && asset.path === seed.targetPath))
      .map((asset) =>
        asset.path === seed.targetPath
          ? {
              ...asset,
              storage: 'generated' as const,
              sourceId: generatedSourceId,
              sourcePath: `recipes/mutations/${seed.id.replaceAll('/', '-')}.json`,
              bytes: mutated.byteLength,
              sha256: mutatedHash,
              derivedFrom: target.sha256,
            }
          : asset,
      );
    const requiredPaths = assets.map((asset) => asset.path).sort();
    const entrypoint = requiredPaths.includes(parent.layout.entrypoint)
      ? parent.layout.entrypoint
      : requiredPaths[0];
    if (!entrypoint) throw new Error(`Negative case has no assets: ${seed.id}`);
    const features = [
      ...new Set([...parent.coverage.features, seed.feature, 'negative.graceful-rejection']),
    ].sort();
    cases.push({
      ...parent,
      id: seed.id,
      caseRevision: 1,
      title: seed.description,
      description: seed.description,
      domain: 'negative',
      layout: { ...parent.layout, entrypoint, requiredPaths },
      assets,
      provenance: {
        sourceId: generatedSourceId,
        originalUrl: 'https://github.com/a-r-d/purejsimage-corpus',
        resolvedAt,
        method: 'mutated',
        parentSha256: target.sha256,
      },
      rights: {
        spdx: 'CC0-1.0',
        licenseName: 'CC0 1.0 Universal',
        evidenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution: 'Generated by purejsimage-corpus',
        redistribution: 'allowed',
      },
      expected: expected(
        'invalid',
        'reject',
        { target: seed.feature },
        assets.reduce((sum, asset) => sum + asset.bytes, 0),
      ),
      coverage: {
        features,
        selectionReason: `Requires bounded graceful rejection for ${seed.feature}.`,
        priority: 'critical',
      },
      collections: ['negative', 'fuzz-regressions'],
      relationships: [{ type: 'mutated-from', caseId: parent.id }],
      notes: [seed.description, 'A crash, hang, panic, or unbounded allocation is a failure.'],
    });
    await writeJson(join(root, 'recipes/mutations', `${seed.id.replaceAll('/', '-')}.json`), {
      schemaVersion: 1,
      id: `mutation/${seed.id.replaceAll('/', '-')}`,
      kind: 'mutation',
      caseId: seed.id,
      description: seed.description,
      parentSha256: target.sha256,
      target: seed.targetPath,
      operations: seed.operations,
    });
  }
  return cases;
}

async function migrateLegacy(): Promise<CorpusCase[]> {
  const manifestPath = join(root, '..', 'PureJsImage', 'benchmark', 'corpus', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { sources: LegacyEntry[] };
  const pin = (url: string): string =>
    url
      .replace(
        'raw.githubusercontent.com/recurser/exif-orientation-examples/master/',
        'raw.githubusercontent.com/recurser/exif-orientation-examples/219294e144531b0c01247913cb58b6f5531b5081/',
      )
      .replace(
        'raw.githubusercontent.com/google/libultrahdr/main/',
        'raw.githubusercontent.com/google/libultrahdr/418b6b361e252a91c435a56cf386afb37d7d1c9d/',
      )
      .replace(
        'raw.githubusercontent.com/web-platform-tests/wpt/master/',
        'raw.githubusercontent.com/web-platform-tests/wpt/5f8cfdc18b18b1619c9fe431eab72f2831823327/',
      );
  return Promise.all(
    manifest.sources.map(async (entry) => {
      const localPath = join(root, '..', 'PureJsImage', 'benchmark', 'corpus', 'files', entry.file);
      const bytes = await readFile(localPath);
      const actualHash = sha256(bytes);
      if (actualHash !== entry.expected.sha256)
        throw new Error(`Legacy hash mismatch: ${entry.id}`);
      const metadata = Object.fromEntries(
        Object.entries(entry.expected).filter(([key]) => key !== 'sha256' && key !== 'format'),
      ) as Record<string, string | number>;
      const features = [
        ...new Set([
          ...commonFeatures,
          `format.${entry.expected.format}`,
          `purejsimage.reader.${entry.expected.format}`,
          'layout.single-file',
          'http.range',
        ]),
      ].sort();
      const containsHuman = /portrait|fbi/i.test(entry.id);
      return {
        schemaVersion: 1,
        id: `ordinary/migrated/${entry.id}`,
        caseRevision: 1,
        title: entry.id.replaceAll('-', ' '),
        description: `Migrated without changing source bytes from PureJsImage benchmark/corpus/manifest.json.`,
        domain: 'ordinary',
        format: {
          family: entry.expected.format,
          extensions: [extname(entry.file).slice(1).toLowerCase()],
          mediaTypes: [mediaType(entry.file)],
          features,
        },
        layout: { kind: 'single-file', entrypoint: entry.file, requiredPaths: [entry.file] },
        assets: [
          {
            path: entry.file,
            role: 'primary',
            storage: 'external',
            sourceId: 'purejsimage',
            sourcePath: entry.file,
            resolvedUrl: pin(entry.url),
            bytes: bytes.byteLength,
            sha256: actualHash,
            mediaType: mediaType(entry.file),
          },
        ],
        provenance: {
          sourceId: 'purejsimage',
          originalUrl: entry.url,
          resolvedAt,
          method: 'migrated',
        },
        rights: {
          licenseName: entry.license,
          evidenceUrl: entry.sourcePage,
          attribution: entry.author,
          redistribution: 'allowed',
        },
        privacy: containsHuman
          ? {
              reviewStatus: 'passed',
              containsHumanData: true,
              phi: 'none',
              burnedInText: 'none',
              gps: 'unknown',
              faces: 'present',
              deidentified: 'not-applicable',
              notes: ['Public ordinary photograph, not medical data.'],
            }
          : privacyNotRequired(),
        expected: expected('valid', 'success', metadata, bytes.byteLength),
        coverage: {
          features,
          selectionReason: 'Preserves an existing PureJsImage benchmark and regression input.',
          priority: 'medium',
        },
        collections: ['ordinary-conformance', 'benchmark-content'],
        notes: [`Original PureJsImage manifest ID: ${entry.id}`],
      } satisfies CorpusCase;
    }),
  );
}

function collection(
  id: string,
  title: string,
  selectors: CollectionRecord['selectors'],
  maximumVendoredBytes: number,
  networkPolicy: CollectionRecord['networkPolicy'],
): CollectionRecord {
  return {
    schemaVersion: 1,
    id,
    title,
    description: `${title} cases.`,
    intendedUse: title,
    networkPolicy,
    maximumVendoredBytes,
    caseIds: [],
    selectors,
    exclusions: [],
  };
}

async function main(): Promise<void> {
  for (const sourceRecord of sources)
    await writeJson(join(root, 'catalog/sources', `${sourceRecord.id}.json`), sourceRecord);
  const baseCases = [...(await migrateLegacy()), ...(await generatedCases()), ...externalCases()];
  const cases = [...baseCases, ...(await negativeCases(baseCases))].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  for (const corpusCase of cases)
    await writeJson(
      join(root, 'catalog/cases', corpusCase.domain, `${corpusCase.id.replaceAll('/', '-')}.json`),
      corpusCase,
    );
  const featureSet = new Set<string>();
  const formatSet = new Set<string>();
  for (const corpusCase of cases) {
    corpusCase.format.features.forEach((feature) => featureSet.add(feature));
    corpusCase.coverage.features.forEach((feature) => featureSet.add(feature));
    formatSet.add(corpusCase.format.family);
  }
  await writeJson(join(root, 'catalog/taxonomy/features.json'), {
    schemaVersion: 1,
    features: [...featureSet].sort(),
  });
  await writeJson(join(root, 'catalog/taxonomy/formats.json'), {
    schemaVersion: 1,
    formats: [...formatSet].sort(),
  });
  const collections = [
    collection(
      'smoke',
      'Offline smoke suite',
      [{ storage: 'generated' }],
      25 * 1024 * 1024,
      'offline',
    ),
    collection(
      'ordinary-conformance',
      'Ordinary codec conformance',
      [{ domain: 'ordinary' }],
      25 * 1024 * 1024,
      'optional',
    ),
    collection(
      'scientific-small',
      'Small scientific readers',
      [{ domain: 'scientific' }],
      25 * 1024 * 1024,
      'optional',
    ),
    collection(
      'geo-small',
      'Small geospatial readers',
      [{ domain: 'geo' }],
      25 * 1024 * 1024,
      'offline',
    ),
    collection(
      'large-range',
      'HTTP range reader cases',
      [{ feature: 'http.range' }],
      25 * 1024 * 1024,
      'optional',
    ),
    collection(
      'directory-formats',
      'Companion and directory layouts',
      [
        { layoutKind: 'companion-set' },
        { layoutKind: 'directory-tree' },
        { layoutKind: 'archive' },
      ],
      25 * 1024 * 1024,
      'optional',
    ),
    collection(
      'negative',
      'Negative and bounded-rejection cases',
      [{ domain: 'negative' }],
      25 * 1024 * 1024,
      'offline',
    ),
    collection(
      'fuzz-regressions',
      'Promoted fuzz regressions',
      [{ classification: 'crash-regression' }],
      25 * 1024 * 1024,
      'offline',
    ),
    collection('benchmark-content', 'Benchmark content', [], 0, 'required'),
    collection('license-review', 'Cases requiring asset license review', [], 0, 'required'),
  ];
  for (const record of collections) {
    if (record.id === 'benchmark-content') {
      record.caseIds = cases
        .filter((corpusCase) => corpusCase.collections.includes('benchmark-content'))
        .map((corpusCase) => corpusCase.id);
    }
    if (record.id === 'license-review') {
      record.caseIds = cases
        .filter((corpusCase) => corpusCase.rights.redistribution === 'unknown')
        .map((corpusCase) => corpusCase.id);
    }
  }
  for (const record of collections)
    await writeJson(join(root, 'catalog/collections', `${record.id}.json`), record);
  process.stdout.write(`Bootstrapped ${sources.length} sources and ${cases.length} cases.\n`);
}

await main();
