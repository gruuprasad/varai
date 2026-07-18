from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class Base:
    pass


class Project(Base):
    pass


class ProjectResponse(BaseModel):
    project_id: str


@app.get("/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str):
    return ProjectResponse(project_id=project_id)
