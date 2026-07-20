import { useNavigate } from "react-router-dom";

export default function CreateWorkspaceForm() {
  const navigate = useNavigate();
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const workspace = await fetch("/workspaces", { method: "POST" });
    navigate(`/workspaces/${workspace.id}/edit`);
  }
  return <form onSubmit={handleSubmit}><button>Create</button></form>;
}
