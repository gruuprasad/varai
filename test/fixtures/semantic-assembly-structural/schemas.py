from pydantic import BaseModel


class StructuralCatalogResponse(BaseModel):
    revision: int


class StructuralTypeMutationResponse(StructuralCatalogResponse):
    type_id: str


class StructuralTypePreviewResponse(BaseModel):
    has_integrity_changes: bool


class UpdateStructuralTypeRequest(BaseModel):
    preview_fingerprint: str
