## Behaviors (7 across 2 bundles)

### {job-id} (6) — job-scoped — needs: get_ctx

  Subject: item document (file, per-job)
  derived (recomputed, never edited directly): quantities, elevation, streaming
  mutation ceremony: check revision · persist · save undo — followed by 3/3

  GET   /{job_id}/quantities    no writes found · 1 calls unverified · returns QuantitiesResponse
  GET   /{job_id}/elevation    no writes found · 1 calls unverified · returns ElevationResponse
  GET   /{job_id}/export    no writes found · 1 calls unverified · returns StreamingResponse
  PATCH /{job_id}/site    returns MutationResponse · stores file · fails with 409
  PATCH /{job_id}/grid    returns MutationResponse · stores file · fails with 409
  PATCH /{job_id}/constraint    returns MutationResponse · stores file · fails with 409

### Other (1) — needs: get_db

  POST  /login    reads only · takes LoginRequest · returns LoginResponse · reads db (Item) · needs JWT_EXPIRATION_MINUTES config · fails with 401

