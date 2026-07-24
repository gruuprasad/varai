from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/orders")


class OrderResponse(BaseModel):
    label: str


@router.get("/{order_id}")
def get_order(order_id: int):
    from app.users import get_user
    get_user(order_id)
    return OrderResponse(label="order")
