import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import * as vg from "@uwdata/vgplot";
import { LoadingState } from "../types/loading";

interface GravitationalLensingContextValue {
  state: LoadingState;
  recomputeLensing: () => Promise<void>;
  addLens: (cx: number, cy: number, e: number) => Promise<void>;
  removeLastLens: () => Promise<void>;
  isComputing: boolean;
}

const GravitationalLensingContext =
  createContext<GravitationalLensingContextValue>({
    state: { status: "idle" },
    recomputeLensing: async () => {},
    addLens: async () => {},
    removeLastLens: async () => {},
    isComputing: false,
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let coordinatorRef: any = null;

export function GravitationalLensingProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<LoadingState>({ status: "idle" });
  const [isComputing, setIsComputing] = useState(false);
  const initRef = useRef(false);

  // Recompute lensing when lenses change
  // isInitial: true during initial setup (shows loading screen), false for user operations (uses isComputing only)
  const recomputeLensing = useCallback(async (isInitial = false) => {
    if (!coordinatorRef) return;
    setIsComputing(true);

    try {
      // When no lenses exist, SUM returns NULL, COALESCE gives 0, so beta = theta (no deflection).
      const lensingQuery = `
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
      // Only update loading state during initial setup to avoid UI flash on user operations
      if (isInitial) {
        setState({ status: "creating-tables", table: "lensed_grid", query: lensingQuery });
      }
      await coordinatorRef.exec(lensingQuery);
      if (isInitial) {
        setState({ status: "ready" });
      }
    } catch (err) {
      console.error("Failed to compute lensing:", err);
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsComputing(false);
    }
  }, []);

  // Add a new lens
  const addLens = useCallback(
    async (cx: number, cy: number, e: number) => {
      if (!coordinatorRef) return;
      setIsComputing(true);
      try {
        await coordinatorRef.exec(`
        INSERT INTO lenses (lens_id, cx, cy, e)
        SELECT COALESCE(MAX(lens_id), 0) + 1, ${cx}, ${cy}, ${e} FROM lenses
      `);
        await recomputeLensing();
      } finally {
        setIsComputing(false);
      }
    },
    [recomputeLensing]
  );

  // Remove the last lens
  const removeLastLens = useCallback(async () => {
    if (!coordinatorRef) return;
    setIsComputing(true);
    try {
      await coordinatorRef.exec(`
        DELETE FROM lenses WHERE lens_id = (SELECT MAX(lens_id) FROM lenses)
      `);
      await recomputeLensing();
    } finally {
      setIsComputing(false);
    }
  }, [recomputeLensing]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      try {
        setState({ status: "initializing" });

        const connector = vg.wasmConnector();
        const coordinator = new vg.Coordinator(connector, {
          cache: false,
          preagg: { enabled: false },
        });
        vg.coordinator(coordinator).databaseConnector(connector);
        await connector.getDuckDB();
        coordinatorRef = coordinator;

        // Create source_grid table: 2000x2000 normalized coordinates
        const gridQuery = `
          CREATE TABLE IF NOT EXISTS source_grid AS 
          SELECT 
            x.range AS ix, 
            y.range AS iy, 
            -1.0 + 2.0 * x.range / 1999.0 AS theta_x, 
            -1.0 + 2.0 * y.range / 1999.0 AS theta_y
          FROM range(2000) x, range(2000) y
        `;
        setState({
          status: "creating-tables",
          table: "source_grid",
          query: gridQuery,
        });
        await coordinator.exec(gridQuery);

        // Create lenses table with sample data (12 lenses with varied e values)
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
        setState({
          status: "creating-tables",
          table: "lenses",
          query: lensesQuery,
        });
        await coordinator.exec(lensesQuery);

        // Compute initial lensing (isInitial=true to show loading state)
        await recomputeLensing(true);
      } catch (err) {
        console.error(
          "Failed to initialize Gravitational Lensing context:",
          err
        );
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    };

    init();
  }, [recomputeLensing]);

  return (
    <GravitationalLensingContext.Provider
      value={{
        state,
        recomputeLensing,
        addLens,
        removeLastLens,
        isComputing,
      }}
    >
      {children}
    </GravitationalLensingContext.Provider>
  );
}

export const useGravitationalLensing = () =>
  useContext(GravitationalLensingContext);
