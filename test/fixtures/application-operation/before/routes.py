from fastapi import FastAPI

from domain import CatalogDocument, load_catalog, save_catalog

app = FastAPI()


@app.post("/catalog/items", response_model=CatalogDocument)
def save_items():
    document = load_catalog()
    save_catalog(document)
    return document
