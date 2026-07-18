import { createSymbolIndex } from "./symbol-index.js";

// Compatibility seam retained for focused behavior tests and callers.
export function createResolver(files, ctx, options) {
  return createSymbolIndex(files, ctx, options);
}
