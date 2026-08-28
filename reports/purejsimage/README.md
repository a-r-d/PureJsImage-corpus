# PureJsImage reports

Run `npm run report:purejsimage` to write `latest.json` and `latest.md` here.

Local reports are ignored because they contain timestamps and describe the exact PureJsImage build
on the machine that ran them. CI runs the offline smoke collection against a pinned PureJsImage
release and uploads both report files as a workflow artifact.
