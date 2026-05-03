// Shared helpers for the icicle / sankey / trajectory-table chart components.
// Centralised so the same Arrow-vs-array unwrap logic isn't repeated across
// every consumer of `coordinator.query()` results.

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Convert anything Arrow-shaped into a JS array — handles plain arrays, Arrow
 * Tables (`.toArray()`), and Arrow Vectors with `.length` + `.get(i)`.
 */
export function asArray(x: any): unknown[] {
  if (x == null) return [];
  if (Array.isArray(x)) return x;
  if (typeof x.toArray === "function") return x.toArray();
  if (typeof x.length === "number" && typeof x.get === "function") {
    const out: unknown[] = [];
    for (let i = 0; i < x.length; i++) out.push(x.get(i));
    return out;
  }
  return [x];
}

/** Materialise an Arrow Table into a JS array of row objects. */
export function arrowRows(table: any): Record<string, unknown>[] {
  if (!table) return [];
  if (typeof table.toArray === "function") return table.toArray();
  if (Array.isArray(table)) return table;
  return [];
}

/** Convenience: first row of an Arrow result, or null if empty. */
export function arrowFirstRow(table: any): Record<string, unknown> | null {
  const rows = arrowRows(table);
  return rows.length ? rows[0] : null;
}

/** Coerce an Arrow / array column into a JS array of strings. */
export function asStringList(v: any): string[] {
  return asArray(v).map((x) => (x == null ? "" : String(x)));
}

/** Whether two sets share at least one element. */
export function setIntersects<T>(a: Set<T>, b: Set<T>): boolean {
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  let found = false;
  s.forEach((x) => {
    if (!found && l.has(x)) found = true;
  });
  return found;
}
