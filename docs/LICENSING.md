# Licensing workflow

Record source-code licensing and asset licensing separately. Inspect the asset's own metadata,
adjacent notices, provenance page, and upstream repository history. Use an SPDX identifier only
when the exact license is established. Preserve required attribution verbatim when practical.

Choose `allowed` only with redistribution evidence. Choose `download-only` when use or download is
permitted but redistribution is not. Choose `unknown` when evidence is incomplete. Choose
`forbidden` when redistribution is disallowed. The final three never appear under
`assets/vendored/`.

Generated and sanitized derivatives are separate cases with parent provenance. Sanitization does
not erase upstream rights.
