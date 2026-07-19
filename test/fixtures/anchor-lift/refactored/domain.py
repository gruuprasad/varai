class BuildingDocument:
    def add_wall(self, wall_id: str):
        pass

    def delete_storey(self, storey_id: str):
        pass

    def import_model(self, payload: dict):
        pass


def open_document(project_id: str) -> BuildingDocument:
    return BuildingDocument()


def write_document(document: BuildingDocument) -> None:
    prepare_document(document)
    save_document(document)


def prepare_document(document: BuildingDocument) -> None:
    pass


def perform_add_wall(document: BuildingDocument, wall_id: str) -> None:
    document.add_wall(wall_id)


def perform_delete_storey(document: BuildingDocument, storey_id: str) -> None:
    document.delete_storey(storey_id)


def perform_import(document: BuildingDocument, payload: dict) -> None:
    document.import_model(payload)
