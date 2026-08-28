# Adding cases

1. Add or reuse a pinned source record.
2. Measure every asset byte size and SHA-256. Never copy a registry hash without verifying bytes.
3. Decide storage from asset-level rights, privacy, and size. Unknown means external.
4. Add a stable slash-separated case ID, exact logical layout, bounded expected behavior, and a
   nonempty coverage reason.
5. Use only taxonomy feature claims. Add new claims deliberately.
6. For generated or mutated data, add a deterministic recipe and regenerate the content blob.
7. Run `npm run corpus -- validate`, `npm run corpus -- build-index`, and `npm run check`.
8. Report the coverage delta and vendored-byte delta in the change description.

Do not add redundant bytes solely to increase counts. Relate intentional shared blobs explicitly.
