from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.common import get_ctx, _load_item, apply_mutation, assert_revision, persist_document, push_undo_snapshot

router = APIRouter(prefix="/api/v1/items")


class QuantitiesResponse(BaseModel):
    total: int


class ElevationResponse(BaseModel):
    view: str


class MutationResponse(BaseModel):
    revision: int


@router.get("/{job_id}/quantities", response_model=QuantitiesResponse)
def quantities(ctx = Depends(get_ctx)):
    document = _load_item(ctx)
    return QuantitiesResponse(total=compute_quantities(document))


@router.get("/{job_id}/elevation", response_model=ElevationResponse)
def elevation(ctx = Depends(get_ctx)):
    document = _load_item(ctx)
    return ElevationResponse(view=compute_elevation(document))


@router.get("/{job_id}/export")
def export(ctx = Depends(get_ctx)):
    document = _load_item(ctx)
    return StreamingResponse(render_pdf(document))


@router.patch("/{job_id}/site", response_model=MutationResponse)
def update_site(ctx = Depends(get_ctx)):
    document = _load_item(ctx)
    return apply_mutation(ctx, document, 1, update_site_fn)


@router.patch("/{job_id}/grid", response_model=MutationResponse)
def update_grid(ctx = Depends(get_ctx)):
    document = _load_item(ctx)
    return apply_mutation(ctx, document, 1, update_grid_fn)


@router.patch("/{job_id}/constraint", response_model=MutationResponse)
def update_constraint(ctx = Depends(get_ctx)):
    document = _load_item(ctx)
    assert_revision(document, 1)
    persist_document(document)
    push_undo_snapshot(document)
    return MutationResponse(revision=2)
