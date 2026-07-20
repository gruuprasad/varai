from fastapi import FastAPI, HTTPException

from domain import (
    ensure_document,
    load_context,
    perform,
    preview_structural_type,
    update_structural_type,
)
from schemas import (
    StructuralTypeMutationResponse,
    StructuralTypePreviewResponse,
    UpdateStructuralTypeRequest,
)

app = FastAPI()


@app.post(
    "/api/v1/building-model/{job_id}/structural-types/{type_id}/preview",
    response_model=StructuralTypePreviewResponse,
)
def preview_structural_type_route(job_id: str, type_id: str, request: UpdateStructuralTypeRequest):
    ctx = load_context(job_id)
    document = ensure_document(ctx)
    perform(ctx, document, preview_structural_type)
    return StructuralTypePreviewResponse(has_integrity_changes=True)


@app.put(
    "/api/v1/building-model/{job_id}/structural-types/{type_id}",
    response_model=StructuralTypeMutationResponse,
)
def put_structural_type(job_id: str, type_id: str, request: UpdateStructuralTypeRequest):
    ctx = load_context(job_id)
    document = ensure_document(ctx)
    perform(ctx, document, update_structural_type)
    if request.preview_fingerprint == "required":
        raise HTTPException(status_code=409, detail="preview required or stale")
    return StructuralTypeMutationResponse(revision=2, type_id=type_id)
