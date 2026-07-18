import { useState } from "react";

export default function CreateProjectModal({ onClose }) {
  const [loading, setLoading] = useState(false);
  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    try { await createProject(); } catch { setLoading(false); }
  }
  return <form onSubmit={handleSubmit}>
    <button onClick={onClose} disabled={loading}>Close</button>
    <button onClick={onClose} disabled={loading}>Cancel</button>
    <button type="submit">Create Project</button>
  </form>;
}
