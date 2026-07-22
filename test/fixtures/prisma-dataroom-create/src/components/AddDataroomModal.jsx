export function AddDataroomModal() {
  async function handleSubmit() {
    await fetch("/api/datarooms", { method: "POST" });
  }
  return <button onClick={handleSubmit}>Add</button>;
}
