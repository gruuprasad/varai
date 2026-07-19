export function BuildingToolbar() {
  const deleteStorey = async () => {
    await fetch("/projects/{project_id}/building/storeys/{storey_id}", { method: "DELETE" });
  };

  return <button onClick={deleteStorey}>Delete storey</button>;
}
