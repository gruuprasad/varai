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


def create_item_in_catalog(
    document: CatalogDocument,
    item_id: str,
) -> tuple[CatalogDocument, CreateItemResult]:
    document.catalog.items.append(Item(id=item_id))
    return document, CreateItemResult(item_ids=[item_id])
