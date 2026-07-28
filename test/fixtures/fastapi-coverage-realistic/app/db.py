from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .models import Base

engine = create_engine("sqlite:///./realistic.db", future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, future=True)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
