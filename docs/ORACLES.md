# Oracles and comparisons

PureJsImage is a consumer of this corpus, not its sole oracle. Cases use specifications,
independent implementations, transparent writers, upstream registries, and canonical decoded
representations.

## `rgba8-srgb-v1`

Row-major, top-left-origin, unpremultiplied RGBA bytes in sRGB. The expectation states whether file
orientation is applied. Hash decoded canonical pixels, never a PNG re-encoding.

## `ndarray-v1`

Record dtype, shape, named axes, byte order, and contiguous row-major bytes. Hash normalized metadata
separately from array bytes.

## `metadata-json-v1`

Sort object keys deterministically, normalize numbers and strings, and omit volatile paths and
timestamps before hashing.

Lossless decoders may require an exact canonical SHA-256. Lossy or color-managed paths record
maximum absolute error, RMSE, per-channel tolerance, and alpha exactness, or use structural
comparison when portable pixel identity is not meaningful.

Animation expectations record canvas size, frame rectangles and hashes, delays, disposal, blend,
and loop count. PureJsImage-specific results use `pass`, `known-unsupported`, `known-failure`,
`crash`, or `timeout` under `expectations/purejsimage/`, never in generic validity.
