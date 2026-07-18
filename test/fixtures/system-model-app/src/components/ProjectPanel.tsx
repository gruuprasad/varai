export function ProjectPanel({ loading, onClose }) {
  return <button onClick={onClose} disabled={loading}>Close</button>;
}
