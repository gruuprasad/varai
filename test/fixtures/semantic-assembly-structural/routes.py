from fastapi import FastAPI

from domain import apply_mutation, ensure_document, preview_update
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
def preview_structural_type(job_id: str, type_id: str, request: UpdateStructuralTypeRequest):
    document = ensure_document()
    preview_update(document)
    return StructuralTypePreviewResponse(has_integrity_changes=True)


@app.put(
    "/api/v1/building-model/{job_id}/structural-types/{type_id}",
    response_model=StructuralTypeMutationResponse,
)
def put_structural_type(job_id: str, type_id: str, request: UpdateStructuralTypeRequest):
    document = ensure_document()
    apply_mutation(document)
    return StructuralTypeMutationResponse(revision=2, type_id=type_id)
