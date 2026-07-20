export function StructuralBasisTypesPanel({ preview, busy, jobId, integrityChangesAcknowledged }) {
  async function applyChange() {
    await fetch("/api/v1/building-model/{job_id}/structural-types/{type_id}", { method: "PUT" });
  }

  return <>{!preview
    ? <button onClick={() => void requestPreview()}>Preview change</button>
    : <button
        disabled={busy || !jobId || (preview.has_integrity_changes && !integrityChangesAcknowledged)}
        onClick={() => void applyChange()}
      >Apply change</button>}
  </>;
}
