from fastapi import FastAPI

from domain import (
    CatalogDocument,
    create_item_in_catalog,
    load_catalog,
    save_catalog,
)

app = FastAPI()


@app.post("/catalog/items", response_model=CatalogDocument)
def save_items():
    document = load_catalog()
    document, result = create_item_in_catalog(document, "item-1")
    save_catalog(document)
    return document
