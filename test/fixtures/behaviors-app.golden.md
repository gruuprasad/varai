## Behaviors (7 across 2 bundles)

### items (6) — job-scoped — needs: get_ctx

  Subject: item document (file, per-job)
  derived (recomputed, never edited directly): quantities, elevation
  mutation ceremony: check revision · persist · save undo — followed by 3/3

  GET   /api/v1/items/{job_id}/quantities    no writes found · 1 call unverified · returns QuantitiesResponse
  GET   /api/v1/items/{job_id}/elevation    no writes found · 1 call unverified · returns ElevationResponse
  GET   /api/v1/items/{job_id}/export    no writes found · 1 call unverified · returns StreamingResponse
  PATCH /api/v1/items/{job_id}/site    returns MutationResponse · stores file · fails with 409
  PATCH /api/v1/items/{job_id}/grid    returns MutationResponse · stores file · fails with 409
  PATCH /api/v1/items/{job_id}/constraint    returns MutationResponse · stores file · fails with 409

### Other (1) — needs: get_db

  POST  /api/auth/login    reads only · takes LoginRequest · returns LoginResponse · reads db (Item) · needs JWT_EXPIRATION_MINUTES config · fails with 401

