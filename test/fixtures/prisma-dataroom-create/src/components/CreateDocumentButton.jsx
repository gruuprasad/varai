export function CreateDocumentButton() {
  async function handleClick() {
    await fetch("/api/documents", { method: "POST" });
  }
  return <button onClick={handleClick}>Create</button>;
}
