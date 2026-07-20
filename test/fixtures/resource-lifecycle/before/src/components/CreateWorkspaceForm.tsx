import { useNavigate } from "react-router-dom";

export default function CreateWorkspaceForm() {
  const navigate = useNavigate();
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await fetch("/workspaces", { method: "POST" });
  }
  return <form onSubmit={handleSubmit}><button>Create</button></form>;
}
