from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class Workspace(Base):
    __tablename__ = "workspaces"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]

class AccessGrant(Base):
    __tablename__ = "access_grants"
    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int]

class Owner(Base):
    __tablename__ = "owners"
    id: Mapped[int] = mapped_column(primary_key=True)
