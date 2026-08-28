# purejsimage-corpus

`purejsimage-corpus` is a provenance-first catalog of image-format datasets for
[PureJsImage](https://github.com/a-r-d/PureJsImage) and other readers. It covers ordinary codecs,
scientific arrays, medical images, microscopy, geospatial rasters, companion files, directory
formats, archives, HTTP Range behavior, and bounded failure cases.

It is a format corpus, not a photo collection. A useful case may be a two-byte boundary condition,
an MHD plus RAW pair, every object in a Zarr tree, a remote whole-slide image, or a mutation that
must be rejected without unbounded allocation.

## Case and asset model

A **case** is one logical dataset with provenance, rights, privacy, expected behavior, resource
limits, and coverage claims. An **asset** is one exact byte object inside that case. Cases support
single files, companion sets, multi-file datasets, directory trees, and archives.

Assets use three storage modes:

- `vendored`: redistributable source bytes committed by content hash.
- `external`: downloaded on demand from a resolved URL and verified by SHA-256.
- `generated`: deterministic bytes from a reviewed recipe, committed by content hash.

The local cache is `.cache/blobs/sha256/<prefix>/<sha256>`. Materialized logical layouts live under
`.cache/materialized/`. Git LFS is not required.

## Start here

Node.js 22 or newer is required.

```sh
npm ci
npm test
npm run corpus -- validate
npm run corpus -- verify --collection smoke --offline
```

The smoke collection is network-free and below its 25 MiB budget. Download and materialize larger
sets explicitly:

```sh
npm run corpus -- sync --collection scientific-small
npm run corpus -- sync --case scientific/aperio-svs/cmu-small-region
npm run corpus -- serve --collection smoke --port 8787
```

Browse cases with `list`, `list --format dm4`, and `inspect <case-id>`. Generated coverage is in
[`generated/coverage.md`](generated/coverage.md), while [`docs/FORMAT_PLAN.md`](docs/FORMAT_PLAN.md)
tracks every current PureJsImage registration and remaining gap.

## Downstream consumption

Downstream tools can load canonical JSON files directly or consume the deterministic
`generated/catalog.json` and `generated/cases.jsonl`. `serve` exposes materialized assets with GET,
HEAD, ETags, CORS, and valid 206/416 byte-range semantics for exercising remote readers.

Generic case validity never means that PureJsImage supports a case. Project-specific status belongs
under `expectations/purejsimage/`; see [`docs/ORACLES.md`](docs/ORACLES.md).

## Rights and privacy boundaries

The repository MIT license covers code and documentation, not automatically every corpus asset.
Each case has its own evidence and redistribution decision. Unknown and download-only assets stay
external. See [`ASSET-LICENSING.md`](ASSET-LICENSING.md) and
[`docs/LICENSING.md`](docs/LICENSING.md).

Medical and human-derived data require explicit privacy fields. Pending-review medical data remain
external. Public availability is not proof that an asset is free of PHI, burned-in identifiers,
faces, GPS, or other sensitive content.

## Contributing

Read [`AGENTS.md`](AGENTS.md) and [`docs/ADDING_CASES.md`](docs/ADDING_CASES.md). Every case addition
must report its coverage delta and vendored-byte delta. The full handoff gate is:

```sh
npm run check
```
