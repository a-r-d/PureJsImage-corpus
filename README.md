<!-- Generated from README.template.md and the catalog by `npm run corpus -- build-index`. -->

<div align="center">

<img src="docs/assets/purejsimage-mark.svg" width="54" height="54" alt="PureJsImage corpus brand mark">

<h1>PureJsImage Corpus</h1>

<p><strong>Verified image files for testing codecs, scientific readers, and geospatial rasters.</strong></p>

<p>Exact bytes · traceable sources · clear licenses · checked expectations</p>

<p>
  <a href="https://github.com/a-r-d/purejsimage-corpus/actions/workflows/ci.yml"><img alt="CI status" src="https://img.shields.io/github/actions/workflow/status/a-r-d/purejsimage-corpus/ci.yml?branch=main&amp;style=for-the-badge&amp;logo=githubactions&amp;logoColor=white&amp;label=CI"></a>
  <a href="#format-table"><img alt="Test case count" src="https://img.shields.io/badge/test_cases-117-6b57e8?style=for-the-badge"></a>
  <a href="#format-table"><img alt="Format count" src="https://img.shields.io/badge/formats-53-3f7f12?style=for-the-badge"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge"></a>
</p>

<p>
  <a href="#quick-start"><strong>Quick start</strong></a> ·
  <a href="#format-table"><strong>Format table</strong></a> ·
  <a href="generated/coverage.md">Coverage details</a> ·
  <a href="docs/ADDING_CASES.md">Add a case</a> ·
  <a href="https://github.com/a-r-d/PureJsImage">PureJsImage</a>
</p>

</div>

This repository answers a practical question: **which files should an image reader be tested
against?** It contains ordinary images, scientific arrays, medical and microscopy files,
geospatial rasters, directory-based formats, and deliberately broken inputs.

It is not a photo collection. One test case might be a JPEG, an MHD file plus its RAW data, a Zarr
directory, a whole-slide image downloaded on demand, or a two-byte mutation that must be rejected.

## What a test case contains

A **case** is one thing a reader opens. It may use one file or a group of related files.

| Every case records | Why it matters |
| --- | --- |
| Exact file sizes and SHA-256 hashes | Tests always use the bytes that were reviewed. |
| Original source and pinned revision | A result can be traced back to where the file came from. |
| License and redistribution decision | The repository only ships files it is allowed to ship. |
| Privacy review | Medical or human-derived data is not included casually. |
| Certification status and evidence | Generator review is kept distinct from independent conformance evidence. |
| Expected result | Valid files should open; broken files should fail cleanly. |
| Time, memory, frame, and pixel limits | A small hostile file cannot consume unlimited resources. |

| File type | Where the bytes come from |
| --- | --- |
| `vendored` | Reviewed source bytes stored in this repository by content hash. |
| `generated` | Reproducible fixtures built from a checked-in recipe. |
| `external` | Downloaded when needed, then checked against its recorded size and SHA-256. |

Downloaded files are cached under `.cache/blobs/sha256/`. Ready-to-open case layouts are assembled
under `.cache/materialized/`. Git LFS is not required.

## Quick start

Node.js 22 or newer is required.

```sh
npm ci
npm run check
```

The strict smoke collection is fully offline, stays below 25 MiB, and contains only explicitly
selected cases whose generators or mutations have been reviewed. It is a regression gate, not a
claim that every expected output has independent conformance certification. These commands help
when exploring or preparing other collections:

| Command | What it does |
| --- | --- |
| `npm run corpus -- list` | List every case. Add `--format dm4` to filter by format. |
| `npm run corpus -- inspect <case-id>` | Show the files, source, rights, limits, and expectations for one case. |
| `npm run corpus -- sync --collection scientific-small` | Download and verify the external files used by a collection. |
| `npm run corpus -- sync --case scientific/aperio-svs/cmu-small-region` | Download and verify one case. |
| `npm run corpus -- serve --collection smoke --port 8787` | Serve cases locally with GET, HEAD, ETags, CORS, and byte ranges. |

## Test PureJsImage

Build the sibling `../PureJsImage` checkout, then run the whole catalog:

```sh
npm run report:purejsimage
```

The command writes a readable report and a JSON report under `reports/purejsimage/`. Every case runs
in its own process with the limits recorded in the catalog. The report identifies the exact library
build and hashes the built `dist/` directory.

| Verdict | Meaning |
| --- | --- |
| `pass` | Every declared operation ran and matched its structural, metadata, exact-hash, or rejection contract. |
| `fail` | A declared operation did not run, an expectation differed, or rejection did not match its contract. |
| `unsupported` | The tested library does not claim to handle this valid format or operation. |
| `timeout` | The case exceeded its time limit. |
| `crash` | The isolated worker exited without a usable result. |
| `unavailable` | A required file could not be found or did not match its recorded bytes. |

Ordinary images decode every frame. Scientific datasets decode every plane. Geospatial datasets
decode every non-spatial selection at full primary resolution. Ordinary decoded pixels are hashed
directly in the documented canonical envelope; they are not re-encoded through another codec.

```sh
npm run report:purejsimage -- --offline
npm run report:purejsimage -- --collection smoke --offline
npm run report:purejsimage -- --collection purejsimage-0-17-smoke --offline
npm run report:purejsimage -- --case ordinary/qoi/rgba-2x2 --offline
```

The full command returns a nonzero exit code when it finds failures, timeouts, crashes, or missing
files, but it still finishes the remaining cases and writes both reports.

## Format table

This table is rebuilt from the catalog by `npm run corpus -- build-index`. “Files” counts every file
reference, including companions and objects inside directory formats. Local files are vendored or
generated; external files are checksum-checked downloads.

| Format | What it exercises | Cases | Files | 📦 Local | ☁️ External | Domains | Layouts |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| **`aperio-svs`** | Aperio pyramidal whole-slide microscopy images. | 1 | 1 | 0 | 1 | scientific | single-file |
| **`avif`** | AV1 Image File Format still images and metadata. | 1 | 1 | 0 | 1 | ordinary | single-file |
| **`blockfile`** | NanoMegas ASTAR microscopy block data. | 1 | 1 | 0 | 1 | scientific | single-file |
| **`bmp`** | Windows and OS/2 bitmap variants, palettes, masks, and RLE. | 14 | 14 | 0 | 14 | ordinary | single-file |
| **`cbf`** | Crystallographic Binary Format detector arrays. | 1 | 1 | 1 | 0 | scientific | single-file |
| **`dicom`** | Medical images and metadata in DICOM datasets. | 1 | 1 | 0 | 1 | scientific | single-file |
| **`digital-surf`** | Digital Surf surface-metrology measurements. | 1 | 1 | 0 | 1 | scientific | single-file |
| **`dm3`** | Gatan DigitalMicrograph 3 microscopy data. | 1 | 1 | 0 | 1 | scientific | single-file |
| **`dm4`** | Gatan DigitalMicrograph 4 microscopy data. | 1 | 1 | 0 | 1 | scientific | single-file |
| **`emsa`** | EMSA/MAS spectroscopy text data. | 1 | 1 | 0 | 1 | scientific | single-file |
| **`envi`** | ENVI scientific raster headers with binary payloads. | 1 | 2 | 2 | 0 | scientific | companion-set |
| **`esri-ascii-grid`** | Text-based geospatial elevation or raster grids. | 1 | 1 | 1 | 0 | geo | single-file |
| **`fits`** | Astronomy images and arrays in FITS containers. | 1 | 1 | 1 | 0 | scientific | single-file |
| **`geo-envi`** | Georeferenced ENVI rasters in BIL, BIP, or BSQ layout. | 3 | 6 | 6 | 0 | geo | companion-set |
| **`geotiff`** | TIFF rasters with CRS and affine geospatial metadata. | 1 | 1 | 1 | 0 | geo | single-file |
| **`geozarr`** | Chunked geospatial arrays stored as Zarr trees. | 2 | 4 | 4 | 0 | geo, negative | directory-tree |
| **`gif`** | Palette images and animation using GIF/LZW. | 2 | 2 | 0 | 2 | ordinary | single-file |
| **`gsf`** | Gwyddion Simple Field surface data. | 1 | 1 | 1 | 0 | scientific | single-file |
| **`heic`** | HEIF/HEIC image containers and Apple image samples. | 4 | 4 | 0 | 4 | ordinary | single-file |
| **`ico`** | Windows icon containers with bitmap or PNG images. | 1 | 1 | 1 | 0 | ordinary | single-file |
| **`image-world-file`** | Ordinary images paired with affine world files. | 3 | 6 | 6 | 0 | geo, negative | companion-set |
| **`jp2`** | JPEG 2000 images in JP2 containers. | 1 | 1 | 0 | 1 | ordinary | single-file |
| **`jpeg`** | Baseline, progressive, metadata-rich, and color JPEG images. | 11 | 11 | 0 | 11 | ordinary | single-file |
| **`jpeg-xl`** | JPEG XL images and JPEG reconstruction streams. | 1 | 1 | 0 | 1 | ordinary | single-file |
| **`meta-image`** | MetaImage headers with embedded or detached arrays. | 3 | 5 | 5 | 0 | negative, scientific | companion-set |
| **`mrc`** | MRC/CCP4 microscopy volumes and maps. | 2 | 2 | 1 | 1 | scientific | single-file |
| **`nanonis-sxm`** | Nanonis scanning-probe microscopy measurements. | 1 | 1 | 1 | 0 | scientific | single-file |
| **`ncem-emd`** | NCEM electron-microscopy data in HDF5. | 1 | 1 | 0 | 1 | scientific | single-file |
| **`netcdf-4`** | Grouped HDF5-backed NetCDF-4 datasets. | 1 | 1 | 0 | 1 | geo | single-file |
| **`netcdf-cf`** | NetCDF datasets using Climate and Forecast metadata. | 1 | 1 | 1 | 0 | geo | single-file |
| **`netcdf-classic`** | Classic NetCDF multidimensional arrays. | 1 | 1 | 1 | 0 | geo | single-file |
| **`nifti`** | NIfTI-1 and NIfTI-2 neuroimaging volumes. | 2 | 2 | 2 | 0 | scientific | single-file |
| **`npy`** | NumPy array files with explicit shape and dtype. | 1 | 1 | 1 | 0 | scientific | single-file |
| **`nrrd`** | Nearly Raw Raster Data images and volumes. | 1 | 1 | 1 | 0 | scientific | single-file |
| **`ome-tiff`** | OME-XML microscopy metadata embedded in TIFF. | 1 | 1 | 1 | 0 | scientific | single-file |
| **`ome-zarr`** | OME-NGFF multiscale microscopy stored as Zarr trees. | 1 | 2 | 2 | 0 | scientific | directory-tree |
| **`pam`** | Netpbm arbitrary maps, including alpha channels. | 1 | 1 | 1 | 0 | ordinary | single-file |
| **`pbm`** | Netpbm monochrome bitmap images. | 2 | 2 | 1 | 1 | ordinary | single-file |
| **`pfm`** | Portable floating-point maps in either byte order. | 2 | 2 | 2 | 0 | ordinary | single-file |
| **`pgm`** | Netpbm grayscale images. | 1 | 1 | 1 | 0 | ordinary | single-file |
| **`png`** | Lossless portable images, palettes, alpha, and animation. | 3 | 3 | 0 | 3 | ordinary | single-file |
| **`ppm`** | Netpbm RGB images. | 1 | 1 | 1 | 0 | ordinary | single-file |
| **`qoi`** | Quite OK Image streams and bounded parser failures. | 8 | 8 | 8 | 0 | negative, ordinary | single-file |
| **`radiance-hdr`** | RGBE high-dynamic-range images. | 1 | 1 | 1 | 0 | ordinary | single-file |
| **`rpl`** | Raw Parameter List headers paired with scientific arrays. | 2 | 4 | 2 | 2 | scientific | companion-set |
| **`srtm-hgt`** | SRTM elevation tiles encoded as signed big-endian samples. | 2 | 2 | 2 | 0 | geo, negative | single-file |
| **`tga`** | Truevision TGA raster images. | 1 | 1 | 1 | 0 | ordinary | single-file |
| **`tia-emi`** | FEI/TIA metadata paired with SER microscopy data. | 1 | 2 | 0 | 2 | scientific | companion-set |
| **`tia-ser`** | FEI/TIA SER microscopy images and spectra. | 1 | 1 | 0 | 1 | scientific | single-file |
| **`tiff`** | Tagged Image File Format strips, compression, and sample layouts. | 10 | 10 | 3 | 7 | negative, ordinary | single-file |
| **`velox-emd`** | Thermo Fisher Velox electron-microscopy containers. | 1 | 1 | 0 | 1 | scientific | archive |
| **`webp`** | Lossy, lossless, alpha, and animated WebP images. | 7 | 7 | 0 | 7 | ordinary | single-file |
| **`x3p`** | OpenGPS XML plus binary surface-metrology archives. | 1 | 1 | 1 | 0 | scientific | archive |
| **Total: 53 formats** | Logical files, including shared references | **117** | **132** | **64** | **68** | — | — |

## Use the catalog in another tool

Tools can read the JSON records under `catalog/` or the generated `generated/catalog.json` and
`generated/cases.jsonl`. The local server supports normal requests and HTTP byte ranges for testing
remote readers without changing the source files.

Passing a case only means the selected operation matched the recorded expectation. The separate
certification field says whether that expectation is merely generator-reviewed or supported by an
independent oracle, upstream conformance vector, or specification-derived evidence. A pass does not
mean PureJsImage supports every format in this repository. PureJsImage-specific results live
under [`expectations/purejsimage/`](expectations/purejsimage/); comparison rules are described in
[`docs/ORACLES.md`](docs/ORACLES.md).

## Rights and medical data

The MIT license covers this repository's code and documentation, not every image file. Each case
has its own license evidence and redistribution decision. Files with unclear rights stay external.
See [`ASSET-LICENSING.md`](ASSET-LICENSING.md) and [`docs/LICENSING.md`](docs/LICENSING.md).

Medical and human-derived files receive an explicit privacy review. Files with unresolved PHI,
identifying text, faces, or location data are not vendored merely because they are public.

## Contributing

Read [`docs/ADDING_CASES.md`](docs/ADDING_CASES.md) before adding data. A case is ready when its bytes,
source, license, privacy review, expected behavior, and resource limits are real and validation
passes:

```sh
npm run check
```
