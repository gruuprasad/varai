import os
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.models import Item

router = APIRouter(prefix="/api/auth")

JWT_EXPIRATION_MINUTES = os.getenv("JWT_EXPIRATION_MINUTES")


class LoginRequest(BaseModel):
    email: str


class LoginResponse(BaseModel):
    token: str


@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest, db = Depends(get_db)):
    x = JWT_EXPIRATION_MINUTES
    user = db.query(Item).first()
    if not user:
        raise HTTPException(status_code=401, detail="bad")
    return LoginResponse(token="t")
