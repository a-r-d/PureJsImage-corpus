# PureJsImage manifest migration

Inspected PureJsImage commit `3a1b9936037b308181840a8db65cf4476e70e737` and migrated
`benchmark/corpus/manifest.json` without modifying the sibling checkout.

| Measure                     | Result |
| --------------------------- | -----: |
| Source entries              |     43 |
| Migrated cases              |     43 |
| Deduplicated entries        |      0 |
| Missing license fields      |      0 |
| Missing SHA-256 fields      |      0 |
| Local byte/hash mismatches  |      0 |
| Migration failures          |      0 |
| Ambiguous expected behavior |      0 |

All 43 source files were read from the exact sibling checkout and independently hashed. Three kinds
of floating GitHub raw URLs were resolved to commits: recurser/exif-orientation-examples
`219294e144531b0c01247913cb58b6f5531b5081`, google/libultrahdr
`418b6b361e252a91c435a56cf386afb37d7d1c9d`, and web-platform-tests/wpt
`5f8cfdc18b18b1619c9fe431eab72f2831823327`. Original URLs remain in provenance.

No legacy field failed representation. Legacy `expected` dimensions, frame counts, orientation, and
other technical fields became metadata assertions. Generic decode expectations are structural
because the legacy manifest did not contain canonical decoded-output hashes. Link availability is
audited separately because HTTP availability is not evidence that the pinned bytes are correct.
