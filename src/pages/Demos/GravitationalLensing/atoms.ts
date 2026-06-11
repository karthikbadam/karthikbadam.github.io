import { atom } from "jotai";
import * as vg from "@uwdata/vgplot";
import { localDuckDB } from "../../../components/duckdbLocal";
import { LoadingState } from "../../../types/loading";

type Coordinator = vg.Coordinator;

export const loadingStateAtom = atom<LoadingState>({ status: "idle" });
export const coordinatorAtom = atom<Coordinator | null>(null);
export const isComputingAtom = atom(false);

export const isReadyAtom = atom(
  (get) => get(loadingStateAtom).status === "ready",
);

const LENSING_QUERY = `
  CREATE OR REPLACE TABLE lensed_grid AS
  WITH offsets AS (
    SELECT g.ix, g.iy, g.theta_x, g.theta_y,
      SUM(l.e * l.e * (g.theta_x - l.cx) / NULLIF(POW(g.theta_x - l.cx, 2) + POW(g.theta_y - l.cy, 2), 0)) AS dx,
      SUM(l.e * l.e * (g.theta_y - l.cy) / NULLIF(POW(g.theta_x - l.cx, 2) + POW(g.theta_y - l.cy, 2), 0)) AS dy
    FROM source_grid g LEFT JOIN lenses l ON TRUE
    GROUP BY g.ix, g.iy, g.theta_x, g.theta_y
  )
  SELECT ix, iy, theta_x, theta_y,
    theta_x - COALESCE(dx, 0) AS beta_x,
    theta_y - COALESCE(dy, 0) AS beta_y
  FROM offsets
`;

// Only updates loadingState during initial setup to avoid UI flash on user operations.
export const recomputeLensingAtom = atom(
  null,
  async (get, set, opts: { isInitial?: boolean } = {}) => {
    const coord = get(coordinatorAtom);
    if (!coord) return;
    set(isComputingAtom, true);
    try {
      if (opts.isInitial) {
        set(loadingStateAtom, {
          status: "creating-tables",
          table: "lensed_grid",
          query: LENSING_QUERY,
        });
      }
      await coord.exec(LENSING_QUERY);
      if (opts.isInitial) {
        set(loadingStateAtom, { status: "ready" });
      }
    } catch (err) {
      console.error("Failed to compute lensing:", err);
      set(loadingStateAtom, {
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      set(isComputingAtom, false);
    }
  },
);

export const addLensAtom = atom(
  null,
  async (get, set, payload: { cx: number; cy: number; e: number }) => {
    const coord = get(coordinatorAtom);
    if (!coord) return;
    set(isComputingAtom, true);
    try {
      await coord.exec(`
        INSERT INTO lenses (lens_id, cx, cy, e)
        SELECT COALESCE(MAX(lens_id), 0) + 1, ${payload.cx}, ${payload.cy}, ${payload.e} FROM lenses
      `);
      await set(recomputeLensingAtom);
    } finally {
      set(isComputingAtom, false);
    }
  },
);

export const removeLastLensAtom = atom(null, async (get, set) => {
  const coord = get(coordinatorAtom);
  if (!coord) return;
  set(isComputingAtom, true);
  try {
    await coord.exec(
      `DELETE FROM lenses WHERE lens_id = (SELECT MAX(lens_id) FROM lenses)`,
    );
    await set(recomputeLensingAtom);
  } finally {
    set(isComputingAtom, false);
  }
});

export const initializeLensingAtom = atom(null, async (get, set) => {
  if (get(coordinatorAtom)) return;

  try {
    set(loadingStateAtom, { status: "initializing" });

    const connector = vg.wasmConnector({ duckdb: await localDuckDB() });
    const coord = new vg.Coordinator(connector, {
      cache: false,
      preagg: { enabled: false },
    });
    vg.coordinator(coord).databaseConnector(connector);
    set(coordinatorAtom, coord);

    const gridQuery = `
      CREATE TABLE IF NOT EXISTS source_grid AS
      SELECT
        x.range AS ix,
        y.range AS iy,
        -1.0 + 2.0 * x.range / 1999.0 AS theta_x,
        -1.0 + 2.0 * y.range / 1999.0 AS theta_y
      FROM range(2000) x, range(2000) y
    `;
    set(loadingStateAtom, {
      status: "creating-tables",
      table: "source_grid",
      query: gridQuery,
    });
    await coord.exec(gridQuery);

    const lensesQuery = `
      CREATE TABLE IF NOT EXISTS lenses (
        lens_id INTEGER PRIMARY KEY,
        cx DOUBLE,
        cy DOUBLE,
        e DOUBLE
      );
      INSERT INTO lenses VALUES
        (1, -0.5, 0.3, 0.12),
        (2, 0.4, 0.5, 0.08),
        (3, -0.2, -0.4, 0.15),
        (4, 0.6, -0.3, 0.10),
        (5, 0.0, 0.0, 0.18),
        (6, -0.6, -0.2, 0.07),
        (7, 0.3, 0.2, 0.11),
        (8, -0.1, 0.6, 0.09),
        (9, 0.5, -0.6, 0.14),
        (10, -0.4, 0.0, 0.06),
        (11, 0.2, -0.5, 0.13),
        (12, -0.3, -0.7, 0.05);
    `;
    set(loadingStateAtom, {
      status: "creating-tables",
      table: "lenses",
      query: lensesQuery,
    });
    await coord.exec(lensesQuery);

    await set(recomputeLensingAtom, { isInitial: true });
  } catch (err) {
    console.error("Failed to initialize Gravitational Lensing context:", err);
    set(loadingStateAtom, {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

initializeLensingAtom.onMount = (trigger) => {
  trigger();
};
