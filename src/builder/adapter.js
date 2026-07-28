// Vendor-neutral builder adapter registry. Adapters are interchangeable local
// runners; core never imports a vendor SDK.

const adapters = new Map();

export function registerAdapter(adapter) {
  if (!adapter?.id || typeof adapter.start !== "function") {
    throw new Error("Builder adapter requires id and start()");
  }
  adapters.set(adapter.id, adapter);
  return adapter;
}

export function getAdapter(id) {
  return adapters.get(id) ?? null;
}

export function listAdapters() {
  return [...adapters.keys()].sort();
}

export function clearAdapters() {
  adapters.clear();
}

export function assertAdapterContract(adapter) {
  for (const method of ["start", "send", "stop"]) {
    if (typeof adapter?.[method] !== "function") {
      throw new Error(`Builder adapter missing ${method}()`);
    }
  }
  return adapter;
}
