# Oracles and comparisons

PureJsImage is a consumer of this corpus, not its sole oracle. Cases use specifications,
independent implementations, transparent writers, upstream registries, and canonical decoded
representations.

Every case records a certification status. `uncertified` means the bytes and provenance may be
valid but the expectation has no reviewed certification claim. `generator-reviewed` means a
transparent fixture or mutation recipe was reviewed; it is suitable for regression testing but is
not independent implementation evidence. `single-oracle`, `multi-oracle`,
`upstream-conformance-vector`, and `spec-derived` require recorded evidence. Exact comparison
hashes must be backed by evidence carrying the same canonical-output SHA-256.

## `rgba8-decoder-v1`

Row-major, top-left-origin RGBA bytes normalized directly from the decoder's pixel blocks. Gray is
replicated into RGB and missing alpha is opaque. Integer and floating-point samples use the
documented decoder display range. File orientation and ICC/NCLX color transforms are not applied.
This is the runner's reproducible raw-decode fingerprint; it must not be mistaken for a
color-managed display result.

The hash envelope begins with the ASCII bytes `rgba8-decoder-v1` followed by a NUL byte. Each frame
then contributes its zero-based index, width, and height as unsigned 32-bit big-endian integers
followed by tightly packed RGBA bytes. Hash these bytes directly, never a PNG or other codec
re-encoding.

## `rgba8-srgb-v1`

Row-major, top-left-origin, unpremultiplied RGBA bytes after an explicitly recorded orientation and
color-management policy converts the result to sRGB. This canonical form is reserved for certified
comparisons and is not currently emitted by the PureJsImage compatibility worker.

## `ndarray-v1`

Record dtype, shape, named axes, byte order, and contiguous row-major bytes. Hash normalized metadata
separately from array bytes.

Expected rejections are contracts, not any-error passes. They record the operation, allowed error
codes, whether the format must have been recognized, and stable message fragments. An unsupported
format only satisfies a rejection when the case explicitly permits non-recognition.

## `metadata-json-v1`

Sort object keys deterministically, normalize numbers and strings, and omit volatile paths and
timestamps before hashing.

Lossless decoders may require an exact canonical SHA-256. Lossy or color-managed paths record
maximum absolute error, RMSE, per-channel tolerance, and alpha exactness, or use structural
comparison when portable pixel identity is not meaningful.

Animation expectations record canvas size, frame rectangles and hashes, delays, disposal, blend,
and loop count. PureJsImage-specific results use `pass`, `known-unsupported`, `known-failure`,
`crash`, or `timeout` under `expectations/purejsimage/`, never in generic validity.
