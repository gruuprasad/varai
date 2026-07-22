export default function UploadDocumentButton() {
  async function handleClick() {
    await fetch("/api/teams/42/documents", { method: "POST" });
  }
  return <button onClick={handleClick}>Upload</button>;
}
