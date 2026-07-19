import { updateStructuralType } from "../api/client";

export function StructuralTypePanel({ busy, jobId, preview }) {
  return <button
    disabled={busy || !jobId}
    onClick={() => void mutate(() => updateStructuralType(jobId, preview.type_id))}
  >Apply change</button>;
}
