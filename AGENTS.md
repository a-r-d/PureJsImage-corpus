# Mission

Maintain a provenance-first corpus of logical image datasets for ordinary codecs, scientific
readers, medical imaging, microscopy, and geospatial readers. Correct bytes, rights evidence,
privacy review, and independent expectations matter more than case count.

# Canonical versus generated files

Canonical records live under `catalog/`, `recipes/`, `schemas/`, `expectations/`, and `licenses/`.
Files under `generated/` are deterministic views. `README.md` is rendered from
`README.template.md` and the catalog. Change canonical inputs or the template, run
`npm run corpus -- build-index`, and never hand-edit generated indexes, reports, or `README.md`.

# Non-negotiable corpus invariants

- A case is a logical dataset and may contain one file, companions, many files, a directory tree,
  or an archive.
- SHA-256 is the content identity. Every byte count and hash must be measured.
- Exact upstream bytes are immutable. A changed upstream object is a new case revision or case.
- External GitHub assets use commit SHAs or immutable release refs, never branches.
- Generic validity and downstream implementation status are separate.
- All paths are safe POSIX relative paths. Directory formats list every required object.
- Generated output and collection order are deterministic.
- Adding cases must report the coverage delta and vendored-byte delta.

# Adding a source

Add one strict source record under `catalog/sources/`. Record the tracking reference separately
from the inspected commit or release. Include source and license evidence URLs. A repository license
does not automatically license every test-data asset inside it. Run `update-source` to inspect a
new GitHub head, then review changes explicitly.

# Adding a case

Add a strict record in the matching `catalog/cases/<domain>/` directory. Give the case a stable,
lower-case, slash-separated ID, a nonempty selection reason, measured hashes and sizes, bounded
resource limits, taxonomy-backed features, and every required logical path. Prefer a new coverage
dimension over redundant bytes. Add explicit relationships when blobs are intentionally shared.

# Licensing and attribution

Use an SPDX identifier only when it is genuinely established. Record the human license name,
evidence URL, attribution, and redistribution decision. Keep unknown, forbidden, download-only,
large, or legally ambiguous assets external. Update `ASSET-LICENSING.md` or source-specific evidence
under `licenses/` when a decision needs explanation.

# Privacy and medical data

Every case records privacy status. DICOM and human-derived medical data require explicit review.
Medical bytes with pending review remain external. Do not vendor PHI, private data, unreviewed
burned-in text, or identifying metadata merely because the file is publicly downloadable.

# Generated fixtures

Use a transparent specification-level writer or a pinned independent implementation. Store a
deterministic recipe and generated content-addressed blob. Do not use a PureJsImage encoder as the
only generator. A changed output requires review and a case revision bump.

# Negative and fuzz cases

Promote failures with an exact parent SHA-256, deterministic mutation recipe, and a stated parser
branch or resource failure. Expected behavior is graceful rejection or bounded handling. A crash,
panic, hang, or unbounded allocation always fails.

# Oracles and expected behavior

Follow `docs/ORACLES.md`. Hash canonical decoded pixels, arrays, or normalized metadata, not an
incidental re-encoding. Exact lossless cases may use exact hashes. Lossy/color-managed paths need
explicit tolerances or structural assertions. PureJsImage statuses belong only under
`expectations/purejsimage/`.

# Storage and network rules

Use content-addressed vendored blobs and `.cache/blobs/sha256/`. Materialize logical paths under
`.cache/materialized/`. Downloads are atomic, bounded, locked, checksum-gated, and mirror-aware.
Offline tests and the smoke suite never require network. Do not make Git LFS the default. Do not
modify downloaded bytes in place; sanitized or generated derivatives are separate cases.

# Required validation and tests

Before handoff run:

```sh
npm run check
```

When changing cases, also report coverage and vendored-byte deltas. When changing download or range
behavior, run the focused local HTTP tests. Network audits belong in the scheduled workflow, not
ordinary PR tests.

# Definition of done

A change is done when schemas and semantic validation pass; hashes, sizes, paths, sources,
collections, rights, and privacy are real; deterministic fixtures and mutations regenerate exactly;
indexes are current; offline verification passes; tests cover the behavior; documentation records
gaps honestly; and the change reports coverage and vendored-byte deltas.

# Prohibited shortcuts

- No invented hashes.
- No invented dimensions.
- No invented licenses.
- No placeholder metadata in committed cases.
- No floating raw GitHub URLs.
- No unlicensed vendored assets.
- No PHI or private data.
- No modification of upstream bytes.
- No hand-editing generated indexes.
- No using PureJsImage as the only oracle.
- No adding a file merely to increase case count.
- No adding redundant data without a stated coverage reason.
- No large downloads in PR CI.
- No network access in ordinary unit tests.
- No weakening validation to make bad metadata pass.
