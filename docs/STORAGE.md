# Storage and fetching

Canonical assets are addressed by SHA-256. Redistributable and generated blobs live at
`assets/vendored/sha256/<prefix>/<hash>`. External blobs download atomically into
`.cache/blobs/sha256/<prefix>/<hash>` and are accepted only after size and checksum verification.
Concurrent downloads share a lock. Offline mode fails clearly on cache misses.

Materialization reconstructs exact logical paths below `.cache/materialized/<case-id>/`. Directory
sources use explicit object manifests. Archive extraction rejects absolute paths, traversal, and
links; only named members are extracted within a configured byte limit.

Large, uncertain-rights, or privacy-pending data remain external. Git LFS is not the default storage
architecture. ETags are transport hints, never content identity.
