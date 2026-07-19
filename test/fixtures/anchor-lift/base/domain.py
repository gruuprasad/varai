class BuildingDocument:
    def add_wall(self, wall_id: str):
        pass

    def delete_storey(self, storey_id: str):
        pass

    def import_model(self, payload: dict):
        pass


def load_document(project_id: str) -> BuildingDocument:
    return BuildingDocument()


def persist_document(document: BuildingDocument) -> None:
    save_document(document)


def add_wall_to_document(document: BuildingDocument, wall_id: str) -> None:
    document.add_wall(wall_id)


def delete_storey_from_document(document: BuildingDocument, storey_id: str) -> None:
    document.delete_storey(storey_id)


def import_into_document(document: BuildingDocument, payload: dict) -> None:
    document.import_model(payload)
