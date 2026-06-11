from fastapi import FastAPI
from app.items import router as items_router
from app.auth import router as auth_router

app = FastAPI()
app.include_router(items_router)
app.include_router(auth_router)
