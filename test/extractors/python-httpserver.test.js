import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { extract } from "../../src/scanners/extractors/python-httpserver.js";

test("extracts literal stdlib HTTP routes and an HTML page", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "varai-httpserver-"));
  await writeFile(path.join(dir, "app.py"), `from http.server import BaseHTTPRequestHandler
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/digest": return self.send_json()
        if self.path.startswith("/api/topics/"): return self.send_json()
        if self.path == "/" or self.path == "/index.html": return self.send_html()
    def do_POST(self):
        if self.path != "/api/contributions": return self.send_json()
`);
  const facts = await extract(dir, ["app.py"]);
  assert.deepEqual(facts.filter((fact) => fact.kind === "api_route").map((fact) => fact.name).sort(), [
    "GET /api/digest", "GET /api/topics/{topic_id}", "POST /api/contributions",
  ]);
  assert.equal(facts.find((fact) => fact.kind === "page")?.name, "/");
});
