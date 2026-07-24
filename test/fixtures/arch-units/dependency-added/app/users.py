from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/users")


class UserResponse(BaseModel):
    name: str


@router.get("/{user_id}")
def get_user(user_id: int):
    return UserResponse(name="ada")
