from fastapi import APIRouter
from domain import Workspace, AccessGrant, Owner

router = APIRouter()

@router.post("/workspaces")
def create_workspace(name: str, owner: Owner, db):
    return {"name": name}

@router.post("/access/revoke")
def revoke_access(grant_id: int, db):
    return {"revoked": False}
