import { updateStructuralType } from "../api/client";

export function StructuralTypePanel({ busy, jobId, preview }) {
  const [integrityChangesAcknowledged] = useState(false);
  return <button
    disabled={busy || !jobId || (preview.has_integrity_changes && !integrityChangesAcknowledged)}
    onClick={() => void mutate(() => updateStructuralType(jobId, preview.type_id))}
  >Apply change</button>;
}
