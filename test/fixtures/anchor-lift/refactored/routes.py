from fastapi import FastAPI
from pydantic import BaseModel

from domain import (
    open_document,
    perform_add_wall,
    perform_delete_storey,
    perform_import,
    write_document,
)

app = FastAPI()


class AddWallRequest(BaseModel):
    wall_id: str


class ImportRequest(BaseModel):
    payload: dict


class ActionResponse(BaseModel):
    project_id: str
    revision: int


class PrivateMutation(BaseModel):
    operation: str


@app.post("/projects/{project_id}/building/walls", response_model=ActionResponse)
def add_wall(project_id: str, request: AddWallRequest):
    document = open_document(project_id)
    perform_add_wall(document, request.wall_id)
    write_document(document)
    return ActionResponse(project_id=project_id, revision=2)


@app.delete("/projects/{project_id}/building/storeys/{storey_id}", response_model=ActionResponse)
def delete_storey(project_id: str, storey_id: str):
    document = open_document(project_id)
    perform_delete_storey(document, storey_id)
    write_document(document)
    return ActionResponse(project_id=project_id, revision=2)


@app.post("/projects/{project_id}/building/import", response_model=ActionResponse)
def import_model(project_id: str, request: ImportRequest):
    document = open_document(project_id)
    perform_import(document, request.payload)
    write_document(document)
    return ActionResponse(project_id=project_id, revision=2)


@app.post("/projects/{project_id}/building/archive", response_model=ActionResponse)
def archive_building(project_id: str):
    document = open_document(project_id)
    write_archive(document)
    return ActionResponse(project_id=project_id, revision=2)
