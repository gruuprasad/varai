export function UpdateDocumentButton() {
  async function handleClick() {
    await fetch("/api/teams/42/documents/update", { method: "POST" });
  }
  return <button onClick={handleClick}>Update</button>;
}
