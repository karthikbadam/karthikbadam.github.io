import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import * as vg from "@uwdata/vgplot";
import { LoadingState } from "./SWEBenchContext";

/**
 * Context for Gaia star catalog data access via DuckDB WASM + Mosaic vgplot
 *
 * Handles DuckDB initialization and parquet loading.
 * Creates a brush selection for interactive charts.
 */

type VgSelection = vg.Selection;
type Coordinator = vg.Coordinator;

interface GaiaContextValue {
  state: LoadingState;
  /** vgplot selection for brush interaction */
  brushSelection: VgSelection | null;
  /** vgplot selection for single-star hover interaction */
  hoverSelection: VgSelection | null;
  /** Mosaic coordinator for creating clients */
  coordinator: Coordinator | null;
}

const GaiaContext = createContext<GaiaContextValue>({
  state: { status: "idle" },
  brushSelection: null,
  hoverSelection: null,
  coordinator: null,
});

//https://gaia.aip.de/query/b9cbe033-a5bf-401e-ba85-65d6768f2444/
const PARQUET_FILENAME = "gaia-b9cbe033-a5bf-401e-ba85-65d6768f2444.parquet";

export function GaiaProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadingState>({ status: "idle" });
  const [brushSelection, setBrushSelection] = useState<VgSelection | null>(
    null
  );
  const [hoverSelection, setHoverSelection] = useState<VgSelection | null>(
    null
  );
  const [coordinator, setCoordinator] = useState<Coordinator | null>(null);

  const initRef = useRef(false);

  /**
   * Initialize DuckDB and load the Gaia table with Natural Earth projection
   */
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      try {
        setState({ status: "initializing" });

        // Initialize DuckDB WASM via Mosaic vgplot connector
        const connector = vg.wasmConnector();
        const coord = new vg.Coordinator(connector, {
          cache: false,
          preagg: { enabled: false },
        });
        vg.coordinator(coord).databaseConnector(connector);
        await connector.getDuckDB();
        setCoordinator(coord);

        setState({
          status: "loading-parquet",
          message: "Gaia star catalog...",
        });

        // Build URL for local parquet file
        const baseUrl = window.location.origin;
        const hashBase = window.location.pathname.replace(/\/$/, "");
        const parquetUrl = `${baseUrl}${hashBase}/data/${PARQUET_FILENAME}`;

        // Install httpfs for remote parquet access
        await coord.exec(`INSTALL httpfs; LOAD httpfs;`);
        await coord.exec(`SET threads = 1;`);
        await coord.exec(`SET memory_limit = '4GB';`);

        // Load Gaia with simple RA/Dec projection
        // u = RA (normalized to -180 to 180), v = Dec
        setState({ status: "creating-tables", table: "gaia" });
        await coord.exec(`
          CREATE TABLE IF NOT EXISTS gaia AS
          SELECT
            -- Galactic longitude wrapped to [-180, 180] for a continuous map
            CASE WHEN l > 180 THEN l - 360 ELSE l END AS u,
           
            -- Galactic latitude already in [-90, 90]
            b AS v,
            *
          FROM '${parquetUrl}'
          WHERE phot_g_mean_mag IS NOT NULL
          LIMIT 5000000
        `);

        setState({ status: "creating-tables", table: "gaia_gal" });

        await coord.exec(`
          CREATE OR REPLACE VIEW gaia_gal AS
            SELECT
              CAST(source_id AS VARCHAR) AS source_id,
              u, v,
              parallax,
              phot_g_mean_mag,
              bp_rp,

              -- Wrap l for nicer continuity if you use it elsewhere
              CASE WHEN l > 180 THEN l - 360 ELSE l END AS l_wrap,

              -- Distance proxy (pc). You'll gate parallax later.
              (1000.0 / parallax) AS r_pc,

              -- Galactic unit direction u(l,b)
              cos(b*pi()/180.0) * cos(l*pi()/180.0) AS ux,
              cos(b*pi()/180.0) * sin(l*pi()/180.0) AS uy,
              sin(b*pi()/180.0)                    AS uz

            FROM gaia
            WHERE phot_g_mean_mag IS NOT NULL
              AND l IS NOT NULL AND b IS NOT NULL
              AND parallax IS NOT NULL
              and parallax > 0.5
        `);

        // Create crossfilter selection for brush interaction
        const $brush = vg.Selection.crossfilter();
        setBrushSelection($brush);

        // Create single selection for hover interaction
        const $hover = vg.Selection.single();
        setHoverSelection($hover);

        setState({ status: "ready" });
      } catch (err) {
        console.error("Failed to initialize Gaia context:", err);
        setState({
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "Unknown error loading star catalog",
        });
      }
    };

    init();
  }, []);

  return (
    <GaiaContext.Provider
      value={{
        state,
        brushSelection,
        hoverSelection,
        coordinator,
      }}
    >
      {children}
    </GaiaContext.Provider>
  );
}

export const useGaia = () => useContext(GaiaContext);
