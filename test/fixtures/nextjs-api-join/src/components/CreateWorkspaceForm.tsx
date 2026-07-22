export default function CreateWorkspaceForm() {
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await fetch("/api/workspaces", { method: "POST" });
  }
  return <form onSubmit={handleSubmit}><button>Create</button></form>;
}
