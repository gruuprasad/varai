from fastapi import APIRouter, HTTPException
from domain import Workspace, AccessGrant, Owner

router = APIRouter()

@router.post("/workspaces")
def create_workspace_record(name: str, owner: Owner, db):
    workspace = Workspace(name=name)
    db.add(workspace)
    db.commit()
    return workspace

@router.post("/workspaces")
def create_workspace(name: str, owner: Owner, db):
    workspace = create_workspace_record(name, owner, db)
    return {"id": workspace.id}

@router.post("/access/revoke")
def revoke_access(grant_id: int, db):
    row = db.query(AccessGrant).filter(AccessGrant.id == grant_id).first()
    if not row:
        raise HTTPException(status_code=404)
    row.workspace_id = 0
    db.delete(row)
    db.commit()
    return {"revoked": True}
