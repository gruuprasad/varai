// Expected product surfaces (Seed v3 / ADR 0007). A surface is human-owned
// intent naming one externally reachable way into the system. It carries no
// HTTP path, framework name, file, or symbol — those belong in realization
// surfaceBindings.

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";

export const SURFACE_CHANNELS = Object.freeze(["ui", "api", "webhook", "job", "cli"]);
export const SURFACE_ACCESS = Object.freeze(["public", "authenticated", "internal"]);

export const SURFACE_FIELDS = Object.freeze(["id", "name", "behavior", "channel", "access"]);
export const SURFACE_ID_PATTERN = new RegExp(`^surface\\.${SLUG}$`);

export function surfaceId(name) {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  const id = `surface.${slug}`;
  if (!SURFACE_ID_PATTERN.test(id)) {
    throw new Error(`Cannot derive a surface id from ${JSON.stringify(name)}`);
  }
  return id;
}
