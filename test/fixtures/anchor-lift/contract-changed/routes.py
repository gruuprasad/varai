from fastapi import FastAPI
from pydantic import BaseModel

from domain import (
    add_wall_to_document,
    delete_storey_from_document,
    import_into_document,
    load_document,
    persist_document,
)

app = FastAPI()


class AddWallRequest(BaseModel):
    wall_id: str


class ImportRequest(BaseModel):
    payload: dict


class ActionResponse(BaseModel):
    project_id: str
    revision: int
    warnings: list[str]


class PrivateMutation(BaseModel):
    operation: str


@app.post("/projects/{project_id}/building/walls", response_model=ActionResponse)
def add_wall(project_id: str, request: AddWallRequest):
    document = load_document(project_id)
    add_wall_to_document(document, request.wall_id)
    persist_document(document)
    return ActionResponse(project_id=project_id, revision=2, warnings=[])


@app.delete("/projects/{project_id}/building/storeys/{storey_id}", response_model=ActionResponse)
def delete_storey(project_id: str, storey_id: str):
    document = load_document(project_id)
    delete_storey_from_document(document, storey_id)
    persist_document(document)
    return ActionResponse(project_id=project_id, revision=2, warnings=[])


@app.post("/projects/{project_id}/building/import", response_model=ActionResponse)
def import_model(project_id: str, request: ImportRequest):
    document = load_document(project_id)
    import_into_document(document, request.payload)
    persist_document(document)
    return ActionResponse(project_id=project_id, revision=2, warnings=[])


@app.post("/projects/{project_id}/building/archive", response_model=ActionResponse)
def archive_building(project_id: str):
    document = load_document(project_id)
    write_archive(document)
    return ActionResponse(project_id=project_id, revision=2, warnings=[])
