export async function updateStructuralType(jobId, typeId) {
  return bmFetch(`${jobPath(jobId)}/structural-types/${encodeURIComponent(typeId)}`, { method: "PUT" });
}
