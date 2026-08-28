# PureJsImage expectations

Project-specific results belong here and may use `pass`, `known-unsupported`, `known-failure`,
`crash`, or `timeout`. They do not change generic format validity. No baseline result is committed
until it has been measured against an exact PureJsImage revision.

Run `npm run report:purejsimage` to produce a measured JSON and Markdown report. Runtime reports
record the Git state and fingerprint the exact built `dist/` tree; they are observations, not
accepted baselines. Promote a reviewed result here only when its build identity and expectations
are intentional.
