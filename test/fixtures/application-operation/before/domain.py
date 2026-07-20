from pydantic import BaseModel


class Item(BaseModel):
    id: str


class Catalog(BaseModel):
    items: list[Item]


class CatalogDocument(BaseModel):
    catalog: Catalog


class CreateItemResult(BaseModel):
    item_ids: list[str]


def load_catalog() -> CatalogDocument:
    return CatalogDocument(catalog=Catalog(items=[]))


def save_catalog(document: CatalogDocument) -> None:
    pass
