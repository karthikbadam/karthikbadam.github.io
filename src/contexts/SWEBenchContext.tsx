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
        vg.coordinator().databaseConnector(connector);
        await connector.getDuckDB();

        setState({ status: "loading-parquet", message: "Loading SWE-bench traces..." });

        const coordinator = vg.coordinator();
        const baseUrl = window.location.origin;
        const parquetUrl = `${baseUrl}/data/swe_bench.parquet`;

        await coordinator.exec(`INSTALL httpfs; LOAD httpfs;`);
        await coordinator.exec(`
          CREATE TABLE IF NOT EXISTS raw AS 
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

        // Create spans table with recursive CTE to flatten nested child_spans
        setState({ status: "creating-tables", table: "spans" });
        await coordinator.exec(`
          CREATE TABLE IF NOT EXISTS spans AS
          WITH RECURSIVE 
          top_spans AS (
            SELECT 
              json_extract_string(trace, '$.trace_id') as trace_id,
              UNNEST(from_json(json_extract(trace, '$.spans'), '["JSON"]')) as span_json,
              0 as depth
            FROM raw
          ),
          all_spans AS (
            SELECT trace_id, span_json, depth FROM top_spans
            UNION ALL
            SELECT 
              a.trace_id,
              UNNEST(from_json(json_extract(a.span_json, '$.child_spans'), '["JSON"]')) as span_json,
              a.depth + 1
            FROM all_spans a
            WHERE json_extract(a.span_json, '$.child_spans') IS NOT NULL
              AND json_array_length(json_extract(a.span_json, '$.child_spans')) > 0
              AND a.depth < 3
          ),
          extracted AS (
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
              depth
            FROM all_spans
          ),
          with_duration AS (
            SELECT *,
              CASE 
                WHEN duration_str IS NULL OR duration_str = '' THEN 0.0
                WHEN duration_str LIKE 'PT%' THEN
                  COALESCE(TRY_CAST(regexp_extract(duration_str, 'PT(?:\\d+H)?(?:\\d+M)?([\\d.]+)S', 1) AS DOUBLE), 0.0) +
                  COALESCE(TRY_CAST(regexp_extract(duration_str, 'PT(?:\\d+H)?(\\d+)M', 1) AS DOUBLE) * 60, 0.0) +
                  COALESCE(TRY_CAST(regexp_extract(duration_str, 'PT(\\d+)H', 1) AS DOUBLE) * 3600, 0.0)
                ELSE TRY_CAST(duration_str AS DOUBLE) / 1000000.0
              END as duration,
              epoch(TRY_CAST(timestamp_str AS TIMESTAMP)) as ts_epoch
            FROM extracted
          )
          SELECT 
            trace_id, span_id, parent_id, name, span_attributes, type, 
            timestamp_str, duration_str, tokens, depth, duration,
            ts_epoch - MIN(ts_epoch) OVER (PARTITION BY trace_id) as start_time,
            ROW_NUMBER() OVER (PARTITION BY trace_id ORDER BY timestamp_str) as span_index
          FROM with_duration
        `);

        // Update trace_metrics with computed totals
        await coordinator.exec(`
          CREATE TABLE OR REPLACE trace_metrics AS
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

        // Free memory
        await coordinator.exec(`DROP TABLE IF EXISTS raw`);

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
