import { implementationPath } from "../lift/provenance.js";

const RESPONSE_NAMES = new Set(["Response", "StreamingResponse", "FileResponse"]);
const FORMAT_LABELS = new Map([
  ["pdf", "PDF file"],
  ["dxf", "DXF file"],
  ["dwg", "DWG file"],
  ["glb", "glTF model"],
  ["gltf", "glTF model"],
  ["csv", "CSV file"],
  ["json", "JSON file"],
  ["zip", "ZIP archive"],
  ["png", "PNG image"],
  ["jpg", "JPEG image"],
  ["jpeg", "JPEG image"],
  ["svg", "SVG image"],
]);

const MIME_FORMATS = new Map([
  ["application/pdf", "pdf"],
  ["application/dxf", "dxf"],
  ["application/acad", "dwg"],
  ["model/gltf-binary", "glb"],
  ["model/gltf+json", "gltf"],
  ["text/csv", "csv"],
  ["application/json", "json"],
  ["application/zip", "zip"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/svg+xml", "svg"],
]);

// Recover boundary artifacts only when two independent response signals agree:
// a concrete media type and a filename/content-disposition. Route vocabulary and
// file extensions alone are deliberately insufficient.
export function boundaryArtifactOutputs(fnNode, file, rootEvidence) {
  const outputs = [];
  const body = fnNode.childForFieldName("body");
  if (!body) return outputs;
  const functionText = fnNode.text;
  const disposition = /content-disposition/i.test(functionText);
  const filenameSignal = disposition || /\bfilename\s*=/.test(functionText);
  if (!filenameSignal) return outputs;

  for (const call of body.descendantsOfType("call")) {
    const callee = call.childForFieldName("function")?.text?.split(".").at(-1);
    if (!RESPONSE_NAMES.has(callee)) continue;
    const mediaType = call.text.match(/media_type\s*=\s*["']([^"']+)["']/)?.[1]
      ?? functionText.match(/media_type\s*=\s*["']([^"']+)["']/)?.[1];
    if (!mediaType) continue;
    const format = filenameFormat(functionText) ?? MIME_FORMATS.get(mediaType.toLowerCase());
    if (!format || !FORMAT_LABELS.has(format)) continue;
    const evidence = { file, line: call.startPosition.row + 1, symbol: callee };
    outputs.push({
      key: artifactFamily(format),
      name: FORMAT_LABELS.get(format),
      format,
      mediaType,
      delivery: disposition ? "download" : "response",
      evidence: [evidence],
      implementationPath: implementationPath(rootEvidence, evidence),
      layer: "semantic",
      bindingState: "inferred",
    });
  }
  return unique(outputs);
}

// A deep file write becomes an artifact only when its call path names a stable
// file/media format and the public behavior also exposes an output boundary.
// This turns writer mechanics into an output without treating every file write
// as a semantic artifact.
export function writtenArtifactOutputs(body, signature) {
  if (!(signature.gives?.length)) return [];
  const outputs = [];
  for (const write of body.writes ?? []) {
    if (write.medium !== "file" || write.target !== "file") continue;
    const symbols = [write.detail, ...(write.implementationPath ?? []).map((item) => item.symbol)]
      .filter(Boolean).join(" ");
    const format = namedFormat(symbols);
    if (!format) continue;
    outputs.push({
      key: artifactFamily(format),
      name: FORMAT_LABELS.get(format),
      format,
      delivery: "generated",
      evidence: [write.evidence],
      implementationPath: write.implementationPath,
      layer: "semantic",
      bindingState: "inferred",
    });
  }
  return unique(outputs);
}

function filenameFormat(text) {
  const matches = [...String(text).matchAll(/\.([a-z0-9]{2,8})(?=["'}`]|\b)/gi)]
    .map((match) => match[1].toLowerCase())
    .filter((value) => FORMAT_LABELS.has(value));
  return matches.length === 1 ? matches[0] : null;
}

function namedFormat(text) {
  const tokens = String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const formats = [...new Set(tokens.filter((token) => FORMAT_LABELS.has(token)).map(artifactFamily))];
  return formats.length === 1 ? formats[0] : null;
}

function artifactFamily(format) {
  return format === "gltf" ? "glb" : format;
}

function unique(outputs) {
  return [...new Map(outputs.map((item) => [item.key, item])).values()];
}
