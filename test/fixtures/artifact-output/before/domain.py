from pathlib import Path
from pydantic import BaseModel


class ReportResponse(BaseModel):
    ready: bool


def build_scene() -> dict:
    return {}


def render_scene(scene: dict, output_path: Path) -> Path:
    return output_path
