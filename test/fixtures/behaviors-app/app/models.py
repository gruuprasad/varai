from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Item(Base):
    __tablename__ = "items"


class ItemArtifact(Base):
    __tablename__ = "item_artifacts"
