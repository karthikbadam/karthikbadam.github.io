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

export type LoadingState =
  | { status: "idle" }
  | { status: "initializing" }
  | { status: "loading-parquet"; message: string }
  | { status: "creating-tables"; table: string }
  | { status: "updating-tables"; message: string }
  | { status: "ready" }
  | { status: "error"; message: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VgSelection = any;

interface SWEBenchContextValue {
  state: LoadingState;
  traceSelection: VgSelection | null;
  traceIdValue: string | null;
  clearSelection: () => void;
  getOrCreateView: (name: string, sql: string) => Promise<void>;
}

const SWEBenchContext = createContext<SWEBenchContextValue>({
  state: { status: "idle" },
  traceSelection: null,
  traceIdValue: null,
  clearSelection: () => {},
  getOrCreateView: async () => {},
});

export function SWEBenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadingState>({ status: "idle" });
  const [traceIdValue, setTraceIdValue] = useState<string | null>(null);
  const traceSelectionRef = useRef<VgSelection | null>(null);
  const initRef = useRef(false);
  const createdViewsRef = useRef<Set<string>>(new Set());

  const getOrCreateView = useCallback(async (name: string, sql: string) => {
    if (createdViewsRef.current.has(name)) return;
    const coordinator = vg.coordinator();
    await coordinator.exec(`CREATE VIEW IF NOT EXISTS ${name} AS ${sql}`);
    createdViewsRef.current.add(name);
  }, []);

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

        setState({
          status: "loading-parquet",
          message: "Loading SWE-bench traces...",
        });

        const baseUrl = window.location.origin;
        const parquetUrl = `${baseUrl}/data/swe_bench.parquet`;

        await coordinator.exec(`INSTALL httpfs; LOAD httpfs;`);
        await coordinator.exec(`SET threads = 1;`);
        await coordinator.exec(`SET memory_limit = '4GB';`);

        await coordinator.exec(`
          CREATE TEMPORARY TABLE IF NOT EXISTS raw AS 
          SELECT * FROM read_parquet('${parquetUrl}')
        `);

        // Create trace_metrics table
        setState({ status: "creating-tables", table: "trace_metrics" });
        await coordinator.exec(`
          CREATE TABLE IF NOT EXISTS trace_metrics AS
          WITH parsed AS (
            SELECT 
              json_extract_string(trace, '$.trace_id') as trace_id,
              json_extract_string(labels, '$.category') as error_category,
              json_extract(trace, '$.spans') as spans_json
            FROM raw
          )
          SELECT 
            trace_id,
            error_category,
            json_array_length(spans_json) as span_count,
            ROW_NUMBER() OVER (ORDER BY trace_id) as trace_index
          FROM parsed
        `);

        // Create temporary table for top-level spans
        setState({ status: "creating-tables", table: "top_spans" });
        await coordinator.exec(`
          CREATE TEMPORARY TABLE IF NOT EXISTS top_spans AS
          SELECT 
            json_extract_string(trace, '$.trace_id') as trace_id,
            UNNEST(from_json(json_extract(trace, '$.spans'), '["JSON"]')) as span_json,
            0 as depth
          FROM raw
        `);

        // Create temporary table for all spans (flattened recursively)
        setState({ status: "creating-tables", table: "flattened_spans" });
        await coordinator.exec(`
          CREATE TEMPORARY TABLE IF NOT EXISTS flattened_spans AS
          WITH RECURSIVE flattened AS (
            SELECT trace_id, span_json, depth FROM top_spans
            UNION
            SELECT 
              f.trace_id,
              UNNEST(from_json(json_extract(f.span_json, '$.child_spans'), '["JSON"]')) as span_json,
              f.depth + 1
            FROM flattened f
            WHERE json_extract(f.span_json, '$.child_spans') IS NOT NULL
              AND json_array_length(json_extract(f.span_json, '$.child_spans')) > 0
              AND f.depth < 3
          )
          SELECT * FROM flattened
        `);

        // Create final spans table with extracted fields
        setState({ status: "updating-tables", message: "creating spans table" });
        await coordinator.exec(`
          CREATE TABLE IF NOT EXISTS spans AS
          SELECT 
            trace_id,
            json_extract_string(span_json, '$.span_id') as span_id,
            json_extract_string(span_json, '$.parent_span_id') as parent_id,
            json_extract_string(span_json, '$.span_name') as name,
            json_extract_string(span_json, '$.span_attributes') as span_attributes,
            COALESCE(
              json_extract_string(span_json, '$."span_attributes"."openinference.span.kind"'),
              'INTERNAL'
            ) as type,
            json_extract_string(span_json, '$.timestamp') as timestamp_str,
            json_extract_string(span_json, '$.duration') as duration_str,
            COALESCE(
              TRY_CAST(json_extract(span_json, '$."span_attributes"."llm.token_count.total"') AS INTEGER),
              0
            ) as tokens,
            depth,
            ROW_NUMBER() OVER (PARTITION BY trace_id ORDER BY json_extract_string(span_json, '$.timestamp')) as span_index
          FROM flattened_spans
        `);

        // Add and compute duration column (parse ISO 8601 duration)
        setState({ status: "updating-tables", message: "adding duration column to spans" });
        await coordinator.exec(
          `ALTER TABLE spans ADD COLUMN IF NOT EXISTS duration DOUBLE`
        );
        await coordinator.exec(`
          UPDATE spans SET duration = 
            CASE 
              WHEN duration_str IS NULL OR duration_str = '' THEN 0.0
              WHEN duration_str LIKE 'PT%' THEN
                COALESCE(TRY_CAST(regexp_extract(duration_str, 'PT(?:\\d+H)?(?:\\d+M)?([\\d.]+)S', 1) AS DOUBLE), 0.0) +
                COALESCE(TRY_CAST(regexp_extract(duration_str, 'PT(?:\\d+H)?(\\d+)M', 1) AS DOUBLE) * 60, 0.0) +
                COALESCE(TRY_CAST(regexp_extract(duration_str, 'PT(\\d+)H', 1) AS DOUBLE) * 3600, 0.0)
              ELSE TRY_CAST(duration_str AS DOUBLE) / 1000000.0
            END
        `);

        // Add and compute start_time column (relative to trace start)
        setState({ status: "updating-tables", message: "adding start_time column to spans" });
        await coordinator.exec(
          `ALTER TABLE spans ADD COLUMN IF NOT EXISTS start_time DOUBLE`
        );
        await coordinator.exec(`
          WITH trace_starts AS (
            SELECT trace_id, MIN(epoch(TRY_CAST(timestamp_str AS TIMESTAMP))) as min_start
            FROM spans GROUP BY trace_id
          )
          UPDATE spans SET start_time = 
            epoch(TRY_CAST(timestamp_str AS TIMESTAMP)) - 
            (SELECT min_start FROM trace_starts WHERE trace_starts.trace_id = spans.trace_id)
        `);

        // Update trace_metrics with computed totals
        setState({ status: "updating-tables", message: "updating trace_metrics" });
        await coordinator.exec(`
          CREATE OR REPLACE TABLE trace_metrics AS
          SELECT 
            t.trace_id,
            t.error_category,
            COALESCE(s.span_count, 0) as span_count,
            t.trace_index,
            COALESCE(s.total_duration, 0) as total_duration,
            COALESCE(s.llm_count, 0) as llm_count,
            COALESCE(s.total_tokens, 0) as total_tokens
          FROM trace_metrics t
          LEFT JOIN (
            SELECT 
              trace_id,
              COUNT(*) as span_count,
              SUM(duration) as total_duration,
              COUNT(*) FILTER (WHERE type = 'LLM') as llm_count,
              SUM(tokens) as total_tokens
            FROM spans GROUP BY trace_id
          ) s ON t.trace_id = s.trace_id
        `);

        // Free memory - drop temporary tables
        setState({ status: "updating-tables", message: "dropping temporary tables" });
        await coordinator.exec(`DROP TABLE IF EXISTS raw`);
        await coordinator.exec(`DROP TABLE IF EXISTS top_spans`);
        await coordinator.exec(`DROP TABLE IF EXISTS flattened_spans`);

        // Create shared selection for cross-chart filtering
        traceSelectionRef.current = vg.Selection.single();
        traceSelectionRef.current.addEventListener("value", () => {
          const clauses = traceSelectionRef.current?.clauses;
          if (clauses && clauses.length > 0 && clauses[0].value) {
            const value = clauses[0].value;
            setTraceIdValue(Array.isArray(value) ? value[0] : value);
          } else {
            setTraceIdValue(null);
          }
        });

        setState({ status: "ready" });
      } catch (err) {
        console.error("Failed to initialize SWE-Bench context:", err);
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    };

    init();
  }, []);

  const clearSelection = useCallback(() => {
    if (traceSelectionRef.current) {
      traceSelectionRef.current.update({ source: null, clients: new Set() });
    }
  }, []);

  return (
    <SWEBenchContext.Provider
      value={{
        state,
        traceSelection: traceSelectionRef.current,
        traceIdValue,
        clearSelection,
        getOrCreateView,
      }}
    >
      {children}
    </SWEBenchContext.Provider>
  );
}

export const useSWEBench = () => useContext(SWEBenchContext);
