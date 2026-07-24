from fastapi import FastAPI
from app.orders import router as orders_router
from app.users import router as users_router

app = FastAPI()
app.include_router(orders_router)
app.include_router(users_router)
