import { atom } from "jotai";
import * as vg from "@uwdata/vgplot";
import { LoadingState } from "../../../types/loading";

type VgSelection = vg.Selection;
type Coordinator = vg.Coordinator;

// https://gaia.aip.de/query/b9cbe033-a5bf-401e-ba85-65d6768f2444/
const PARQUET_FILENAME = "gaia-b9cbe033-a5bf-401e-ba85-65d6768f2444.parquet";

export const loadingStateAtom = atom<LoadingState>({ status: "idle" });
export const coordinatorAtom = atom<Coordinator | null>(null);
export const brushSelectionAtom = atom<VgSelection | null>(null);
export const hoverSelectionAtom = atom<VgSelection | null>(null);

export const isReadyAtom = atom(
  (get) => get(loadingStateAtom).status === "ready",
);

export const initializeGaiaAtom = atom(null, async (get, set) => {
  if (get(coordinatorAtom)) return;

  try {
    set(loadingStateAtom, { status: "initializing" });

    const connector = vg.wasmConnector();
    const coord = new vg.Coordinator(connector, {
      cache: false,
      preagg: { enabled: false },
    });
    vg.coordinator(coord).databaseConnector(connector);
    await connector.getDuckDB();
    set(coordinatorAtom, coord);

    const baseUrl = window.location.origin;
    const hashBase = window.location.pathname.replace(/\/$/, "");
    const parquetUrl = `${baseUrl}${hashBase}/data/${PARQUET_FILENAME}`;

    set(loadingStateAtom, {
      status: "loading-parquet",
      message: "Gaia star catalog",
    });

    await coord.exec(`INSTALL httpfs; LOAD httpfs;`);
    await coord.exec(`SET threads = 1;`);
    await coord.exec(`SET memory_limit = '4GB';`);

    const gaiaQuery = `
      CREATE TABLE IF NOT EXISTS gaia AS
      SELECT
        CASE WHEN l > 180 THEN l - 360 ELSE l END AS u,
        b AS v,
        *
      FROM '${parquetUrl}'
      WHERE phot_g_mean_mag IS NOT NULL
      LIMIT 5000000`;

    const gaiaGalQuery = `
      CREATE OR REPLACE VIEW gaia_gal AS
      SELECT
        CAST(source_id AS VARCHAR) AS source_id,
        u, v,
        parallax,
        phot_g_mean_mag,
        bp_rp,
        (1000.0 / parallax) AS r_pc,
        cos(b*pi()/180.0) * cos(l*pi()/180.0) AS ux,
        cos(b*pi()/180.0) * sin(l*pi()/180.0) AS uy,
        sin(b*pi()/180.0)                    AS uz
      FROM gaia
      WHERE phot_g_mean_mag IS NOT NULL
        AND l IS NOT NULL AND b IS NOT NULL
        AND parallax IS NOT NULL
        AND parallax > 0.5`;

    set(loadingStateAtom, {
      status: "creating-tables",
      table: "gaia_gal",
      query: gaiaGalQuery,
    });

    await coord.exec(gaiaQuery);
    await coord.exec(gaiaGalQuery);

    set(brushSelectionAtom, vg.Selection.crossfilter());
    set(hoverSelectionAtom, vg.Selection.single());

    set(loadingStateAtom, { status: "ready" });
  } catch (err) {
    console.error("Failed to initialize Gaia context:", err);
    set(loadingStateAtom, {
      status: "error",
      message:
        err instanceof Error
          ? err.message
          : "Unknown error loading star catalog",
    });
  }
});

initializeGaiaAtom.onMount = (trigger) => {
  trigger();
};
