# Asset licensing boundary

The MIT license in `LICENSE` applies to repository code and documentation. Generated fixtures are
released under CC0-1.0 as recorded in `licenses/generated-fixtures/LICENSE.txt`. Third-party assets
retain their own rights.

Every case records a license name, evidence URL, attribution, and one redistribution status:
`allowed`, `download-only`, `unknown`, or `forbidden`. Only `allowed` assets may be committed as
vendored or generated blobs. A source repository license is not treated as automatic proof for
third-party test data. Public download access is not a redistribution grant.

The current external scientific seed is intentionally conservative: RosettaSciIO, OpenSlide, and
pydicom-data files remain external where asset-level rights are not established. The pydicom case
also remains privacy-pending.
