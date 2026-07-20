from pathlib import Path
from fastapi import FastAPI, Response

from domain import ReportResponse, build_scene, render_scene

app = FastAPI()


@app.get("/reports/monthly")
def monthly_report():
    return Response(content=b"report", media_type="application/pdf")


@app.post("/scenes/render", response_model=ReportResponse)
def render():
    scene = build_scene()
    render_scene(scene, Path("scene.glb"))
    return ReportResponse(ready=True)
