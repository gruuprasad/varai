import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { traceFrontendInteractions } from "../../src/scanners/frontend/interactions.js";

async function trace(source) {
  const dir = await mkdtemp(path.join(tmpdir(), "varai-ui-"));
  await mkdir(path.join(dir, "src/components"), { recursive: true });
  const file = "src/components/Modal.tsx";
  await writeFile(path.join(dir, file), source);
  return traceFrontendInteractions([file], createScanContext(dir));
}

async function traceFiles(sources) {
  const dir = await mkdtemp(path.join(tmpdir(), "varai-ui-files-"));
  for (const [file, source] of Object.entries(sources)) {
    await mkdir(path.join(dir, path.dirname(file)), { recursive: true });
    await writeFile(path.join(dir, file), source);
  }
  return traceFrontendInteractions(Object.keys(sources), createScanContext(dir));
}

test("groups direct callback controls and merges guard evidence", async () => {
  const behaviors = await trace(`export default function Modal({ onClose }) {
    return <><button onClick={onClose} disabled={loading}>X</button><button onClick={onClose} disabled={loading}>Cancel</button></>;
  }`);
  assert.equal(behaviors.length, 1);
  assert.equal(behaviors[0].door.action, "onClose");
  assert.equal(behaviors[0].door.evidence.length, 2);
  assert.equal(behaviors[0].guards.length, 1);
  assert.equal(behaviors[0].guards[0].evidence.length, 2);
});

test("recovers inline callback actions and splits compound disabled guards", async () => {
  const behaviors = await trace(`export const Modal = ({ onClose }) => <>
    <button onClick={() => onClose()} disabled={loading}>X</button>
    <button onClick={onClose} disabled={loading || invalid}>Cancel</button>
  </>;`);
  assert.equal(behaviors.length, 2);
  const inline = behaviors.find((item) => item.door.action === "X");
  assert.ok(inline);
  assert.deepEqual(inline.guards.map((item) => item.condition), ["loading"]);
  const direct = behaviors.find((item) => item.door.action === "onClose");
  assert.deepEqual(direct.guards.map((item) => item.condition), ["loading", "invalid"]);
});

test("retains an integrity acknowledgment gate as a distinct condition", async () => {
  const behaviors = await trace(`export function Panel({ preview, busy, jobId }) {
    return <button
      disabled={busy || !jobId || (preview.has_integrity_changes && !integrityChangesAcknowledged)}
      onClick={() => void updateStructuralType(jobId)}
    >Apply change</button>;
  }`);
  assert.equal(behaviors.length, 1);
  assert.equal(behaviors[0].door.action, "Apply change");
  assert.deepEqual(behaviors[0].guards.map((item) => item.condition), [
    "busy", "!jobId", "preview.has_integrity_changes && !integrityChangesAcknowledged",
  ]);
});

test("recovers ternary-controlled action visibility", async () => {
  const behaviors = await trace(`export function Panel({ preview }) {
    return <>{!preview
      ? <button onClick={() => void requestPreview()}>Preview change</button>
      : <button onClick={() => void applyChange()}>Apply change</button>}
    </>;
  }`);
  const preview = behaviors.find((item) => item.door.action === "Preview change");
  const apply = behaviors.find((item) => item.door.action === "Apply change");

  assert.ok(preview.guards.some((item) => item.kind === "visible_when" && item.condition === "!preview"));
  assert.ok(apply.guards.some((item) => item.kind === "visible_when" && item.condition === "preview"));
});

test("traces an inline action through a unique API wrapper to its transport call", async () => {
  const behaviors = await traceFiles({
    "src/components/Panel.tsx": `import { updateType } from "../api/types";
      export function Panel({ jobId, typeId }) {
        return <button onClick={() => void updateType(jobId, typeId)}>Apply change</button>;
      }`,
    "src/api/types.ts": `export async function updateType(jobId, typeId) {
      return bmFetch(\`${"${jobPath(jobId)}"}/structural-types/${"${encodeURIComponent(typeId)}"}\`, { method: "PUT" });
    }`,
  });
  assert.equal(behaviors.length, 1);
  assert.deepEqual(behaviors[0].invokes.map(({ method, path: routePath }) => ({ method, path: routePath })), [
    { method: "PUT", path: "*/structural-types/*" },
  ]);
  assert.equal(behaviors[0].invokes[0].implementationPath.length, 3);
});

test("traces an API wrapper invoked inside a nested mutation callback", async () => {
  const behaviors = await traceFiles({
    "src/components/Panel.tsx": `import { updateType } from "../api/types";
      export function Panel({ jobId, typeId }) {
        return <button onClick={() => void mutate(() => updateType(jobId, typeId))}>Apply change</button>;
      }`,
    "src/api/types.ts": `export async function updateType(jobId, typeId) {
      return bmFetch(\`${"${jobPath(jobId)}"}/structural-types/${"${encodeURIComponent(typeId)}"}\`, { method: "PUT" });
    }`,
  });
  assert.deepEqual(behaviors[0].invokes.map(({ method, path: routePath }) => ({ method, path: routePath })), [
    { method: "PUT", path: "*/structural-types/*" },
  ]);
});

test("recovers form submission as a UI action and traces its API invocation", async () => {
  const behaviors = await traceFiles({
    "src/components/CreateProjectModal.tsx": `import { createProject } from "../api/projects";
      export default function CreateProjectModal() {
        async function handleSubmit(event) { event.preventDefault(); await createProject(); }
        return <form onSubmit={handleSubmit}><button type="submit">Create project</button></form>;
      }`,
    "src/api/projects.ts": `export async function createProject() {
      return apiFetch("/api/projects", { method: "POST" });
    }`,
  });

  assert.equal(behaviors.length, 1);
  assert.equal(behaviors[0].door.event, "submit");
  assert.equal(behaviors[0].door.action, "handleSubmit");
  assert.deepEqual(behaviors[0].invokes.map(({ method, path: routePath }) => ({ method, path: routePath })), [
    { method: "POST", path: "/api/projects" },
  ]);
});

test("does not invent a separate action for a submit button without an onClick handler", async () => {
  const behaviors = await trace(`export default function Form() {
    function handleSubmit(event) { event.preventDefault(); }
    return <form onSubmit={handleSubmit}><button type="submit">Save</button></form>;
  }`);

  assert.equal(behaviors.length, 1);
  assert.equal(behaviors[0].door.event, "submit");
});

test("does not mistake an object getter for an HTTP GET", async () => {
  const behaviors = await trace(`export default function Panel() {
    async function retry() { response.headers.get("content-type"); }
    return <button onClick={retry}>Retry</button>;
  }`);

  assert.deepEqual(behaviors[0].invokes, []);
});

test("traces a click into a handler stored in useCallback", async () => {
  const behaviors = await trace(`export default function Panel() {
    const refresh = useCallback(async () => apiRequest("/api/items", { method: "GET" }), []);
    return <button onClick={refresh}>Refresh</button>;
  }`);

  assert.deepEqual(behaviors[0].invokes.map(({ method, path: routePath }) => ({ method, path: routePath })), [
    { method: "GET", path: "/api/items" },
  ]);
});

test("recovers a lifecycle load through useEffect and useCallback", async () => {
  const behaviors = await trace(`export default function Inventory() {
    const loadItems = useCallback(async () => apiRequest("/api/items", { method: "GET" }), []);
    useEffect(() => { void loadItems(); }, [loadItems]);
    return <div>Inventory</div>;
  }`);

  assert.equal(behaviors.length, 1);
  assert.equal(behaviors[0].door.event, "lifecycle");
  assert.equal(behaviors[0].door.action, "loadItems");
  assert.deepEqual(behaviors[0].invokes.map(({ method, path: routePath }) => ({ method, path: routePath })), [
    { method: "GET", path: "/api/items" },
  ]);
});

test("traces a callback prop into a uniquely wired parent callback", async () => {
  const behaviors = await traceFiles({
    "src/components/DownloadButton.tsx": `export function DownloadButton({ onDownload }) {
      return <button onClick={() => onDownload()}>Download</button>;
    }`,
    "src/components/Workspace.tsx": `import { DownloadButton } from "./DownloadButton";
      export function Workspace() {
        return <DownloadButton onDownload={() => apiRequest("/api/export", { method: "POST" })} />;
      }`,
  });
  const download = behaviors.find((item) => item.door.component === "DownloadButton");

  assert.deepEqual(download.invokes.map(({ method, path: routePath }) => ({ method, path: routePath })), [
    { method: "POST", path: "/api/export" },
  ]);
});

test("traces a callback prop through a uniquely resolved custom-hook member", async () => {
  const behaviors = await traceFiles({
    "src/components/DownloadButton.tsx": `export function DownloadButton({ onDownload }) {
      return <button onClick={() => onDownload()}>Download</button>;
    }`,
    "src/components/Workspace.tsx": `import { DownloadButton } from "./DownloadButton";
      export function Workspace() {
        const exporter = useExporter();
        return <DownloadButton onDownload={() => exporter.download()} />;
      }`,
    "src/hooks/useExporter.ts": `export function useExporter() {
      const download = async () => apiRequest("/api/export", { method: "POST" });
      return { download };
    }`,
  });
  const download = behaviors.find((item) => item.door.component === "DownloadButton");

  assert.deepEqual(download.invokes.map(({ method, path: routePath }) => ({ method, path: routePath })), [
    { method: "POST", path: "/api/export" },
  ]);
});

test("propagates a literal callback argument through a selected branch", async () => {
  const behaviors = await traceFiles({
    "src/components/DownloadButton.tsx": `export function DownloadButton({ onDownload }) {
      return <button onClick={() => onDownload("dxf")}>Download DXF</button>;
    }`,
    "src/components/Workspace.tsx": `import { DownloadButton } from "./DownloadButton";
      export function Workspace() {
        return <DownloadButton onDownload={(format) => format === "pdf"
          ? apiRequest("/api/export.pdf", { method: "GET" })
          : apiRequest(\`/api/export.${"${format}"}\`, { method: "GET" })} />;
      }`,
  });
  const download = behaviors.find((item) => item.door.component === "DownloadButton");

  assert.deepEqual(download.invokes.map(({ method, path: routePath }) => ({ method, path: routePath })), [
    { method: "GET", path: "/api/export.dxf" },
  ]);
});

test("keeps all statically reachable branches when a callback argument is unknown", async () => {
  const behaviors = await traceFiles({
    "src/components/DownloadButton.tsx": `export function DownloadButton({ onDownload, format }) {
      return <button onClick={() => onDownload(format)}>Download</button>;
    }`,
    "src/components/Workspace.tsx": `import { DownloadButton } from "./DownloadButton";
      export function Workspace() {
        return <DownloadButton onDownload={(format) => format === "pdf"
          ? apiRequest("/api/export.pdf", { method: "GET" })
          : apiRequest("/api/export.cad", { method: "GET" })} />;
      }`,
  });
  const download = behaviors.find((item) => item.door.component === "DownloadButton");

  assert.deepEqual(download.invokes.map(({ path: routePath }) => routePath).sort(), ["/api/export.cad", "/api/export.pdf"]);
});

test("continues through a uniquely typed ref-backed hook API", async () => {
  const behaviors = await traceFiles({
    "src/components/Canvas.tsx": `export function Canvas({ onCanvasClick }) {
      return <button onClick={() => onCanvasClick()}>Draw wall</button>;
    }`,
    "src/components/Workspace.tsx": `import { Canvas } from "./Canvas";
      type WallToolApi = ReturnType<typeof useWallTool>;
      function useWallTool() {
        const commit = async () => apiRequest("/api/walls", { method: "POST" });
        const handleCanvasClick = async () => commit();
        return { handleCanvasClick };
      }
      function usePlanInteraction() {
        const wallToolRef = useRef<WallToolApi | null>(null);
        const handleCanvasClick = async () => wallToolRef.current?.handleCanvasClick();
        return { handleCanvasClick };
      }
      export function Workspace() {
        const interaction = usePlanInteraction();
        return <Canvas onCanvasClick={() => interaction.handleCanvasClick()} />;
      }`,
  });
  const draw = behaviors.find((item) => item.door.component === "Canvas");

  assert.deepEqual(draw.invokes.map(({ method, path: routePath }) => ({ method, path: routePath })), [
    { method: "POST", path: "/api/walls" },
  ]);
});
