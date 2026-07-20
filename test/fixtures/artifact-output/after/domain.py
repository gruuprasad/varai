from pathlib import Path
from pydantic import BaseModel


class ReportResponse(BaseModel):
    ready: bool


def build_scene() -> dict:
    return {}


def write_glb_scene(scene: dict, output_path: Path) -> Path:
    output_path.write_bytes(b"glb")
    return output_path


def render_scene(scene: dict, output_path: Path) -> Path:
    return write_glb_scene(scene, output_path)
