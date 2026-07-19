export function OrphanPanel() {
  const resetWalls = async () => {
    await fetch("/projects/{project_id}/building/walls", { method: "POST" });
  };
  return <button onClick={resetWalls}>Reset walls</button>;
}
