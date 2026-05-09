import { atom } from "jotai";
import * as vg from "@uwdata/vgplot";
import { LoadingState } from "../../../types/loading";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VgSelection = any;
type Coordinator = vg.Coordinator;

export const loadingStateAtom = atom<LoadingState>({ status: "idle" });
export const coordinatorAtom = atom<Coordinator | null>(null);
export const traceSelectionAtom = atom<VgSelection | null>(null);
export const traceIdValueAtom = atom<string | null>(null);
export const createdViewsAtom = atom<Set<string>>(new Set<string>());

export const isReadyAtom = atom(
  (get) => get(loadingStateAtom).status === "ready",
);
export const hasTraceSelectedAtom = atom(
  (get) => get(traceIdValueAtom) !== null,
);

export const getOrCreateViewAtom = atom(
  null,
  async (get, set, payload: { name: string; sql: string }) => {
    const created = get(createdViewsAtom);
    if (created.has(payload.name)) return;
    const coord = vg.coordinator();
    await coord.exec(
      `CREATE VIEW IF NOT EXISTS ${payload.name} AS ${payload.sql}`,
    );
    set(createdViewsAtom, new Set(created).add(payload.name));
  },
);

export const clearTraceSelectionAtom = atom(null, (get) => {
  const sel = get(traceSelectionAtom);
  sel?.update({ source: null, clients: new Set() });
});

export const initializeSWEBenchAtom = atom(null, async (get, set) => {
  if (get(coordinatorAtom)) return;

  try {
    set(loadingStateAtom, { status: "initializing" });

    const traceLimit = window.innerWidth < 768 ? 5 : 50;

    const connector = vg.wasmConnector();
    const coord = new vg.Coordinator(connector, {
      cache: false,
      preagg: { enabled: false },
    });
    vg.coordinator(coord).databaseConnector(connector);
    set(coordinatorAtom, coord);
    await connector.getDuckDB();

    set(loadingStateAtom, {
      status: "loading-parquet",
      message: "Loading SWE-bench traces...",
    });

    const baseUrl = window.location.origin;
    const parquetUrl = `${baseUrl}/data/swe_bench.parquet`;

    await coord.exec(`INSTALL httpfs; LOAD httpfs;`);
    await coord.exec(`SET threads = 1;`);
    await coord.exec(`SET memory_limit = '4GB';`);

    await coord.exec(`
      CREATE TEMPORARY TABLE IF NOT EXISTS raw AS
      SELECT * FROM read_parquet('${parquetUrl}')
    `);

    const traceMetricsQuery = `
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
    `;
    set(loadingStateAtom, {
      status: "creating-tables",
      table: "trace_metrics",
      query: traceMetricsQuery,
    });
    await coord.exec(traceMetricsQuery);

    const topSpansQuery = `
      CREATE TEMPORARY TABLE IF NOT EXISTS top_spans AS
      SELECT
        json_extract_string(trace, '$.trace_id') as trace_id,
        UNNEST(from_json(json_extract(trace, '$.spans'), '["JSON"]')) as span_json,
        0 as depth
      FROM raw
      limit ${traceLimit}
    `;
    set(loadingStateAtom, {
      status: "creating-tables",
      table: "top_spans",
      query: topSpansQuery,
    });
    await coord.exec(topSpansQuery);

    const flattenedSpansQuery = `
      CREATE TEMPORARY TABLE IF NOT EXISTS flattened_spans AS
      WITH RECURSIVE flattened AS (
        SELECT trace_id, span_json, depth FROM top_spans
        UNION ALL
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
    `;
    set(loadingStateAtom, {
      status: "creating-tables",
      table: "flattened_spans",
      query: flattenedSpansQuery,
    });
    await coord.exec(flattenedSpansQuery);

    const spansQuery = `
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
    `;
    set(loadingStateAtom, {
      status: "updating-tables",
      message: "extracting values from spans",
      query: spansQuery,
    });
    await coord.exec(spansQuery);

    const durationQuery = `
      UPDATE spans SET duration =
        CASE
          WHEN duration_str IS NULL OR duration_str = '' THEN 0.0
          WHEN duration_str LIKE 'PT%' THEN
            COALESCE(TRY_CAST(regexp_extract(duration_str, 'PT(?:\\d+H)?(?:\\d+M)?([\\d.]+)S', 1) AS DOUBLE), 0.0) +
            COALESCE(TRY_CAST(regexp_extract(duration_str, 'PT(?:\\d+H)?(\\d+)M', 1) AS DOUBLE) * 60, 0.0) +
            COALESCE(TRY_CAST(regexp_extract(duration_str, 'PT(\\d+)H', 1) AS DOUBLE) * 3600, 0.0)
          ELSE TRY_CAST(duration_str AS DOUBLE) / 1000000.0
        END
    `;
    set(loadingStateAtom, {
      status: "updating-tables",
      message: "adding duration column to spans",
      query: durationQuery,
    });
    await coord.exec(
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS duration DOUBLE`,
    );
    await coord.exec(durationQuery);

    const startTimeQuery = `
      WITH trace_starts AS (
        SELECT trace_id, MIN(epoch(TRY_CAST(timestamp_str AS TIMESTAMP))) as min_start
        FROM spans GROUP BY trace_id
      )
      UPDATE spans SET start_time =
        epoch(TRY_CAST(timestamp_str AS TIMESTAMP)) -
        (SELECT min_start FROM trace_starts WHERE trace_starts.trace_id = spans.trace_id)
    `;
    set(loadingStateAtom, {
      status: "updating-tables",
      message: "adding start_time column to spans",
      query: startTimeQuery,
    });
    await coord.exec(
      `ALTER TABLE spans ADD COLUMN IF NOT EXISTS start_time DOUBLE`,
    );
    await coord.exec(startTimeQuery);

    const updateMetricsQuery = `
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
       WHERE total_duration > 0
    `;
    set(loadingStateAtom, {
      status: "updating-tables",
      message: "updating trace_metrics",
      query: updateMetricsQuery,
    });
    await coord.exec(updateMetricsQuery);

    set(loadingStateAtom, {
      status: "updating-tables",
      message: "dropping temporary tables",
    });
    await coord.exec(`DROP TABLE IF EXISTS raw`);
    await coord.exec(`DROP TABLE IF EXISTS top_spans`);
    await coord.exec(`DROP TABLE IF EXISTS flattened_spans`);

    const sel = vg.Selection.single();
    sel.addEventListener("value", () => {
      const clauses = sel.clauses;
      if (clauses && clauses.length > 0 && clauses[0].value) {
        const value = clauses[0].value;
        set(traceIdValueAtom, Array.isArray(value) ? value[0] : value);
      } else {
        set(traceIdValueAtom, null);
      }
    });
    set(traceSelectionAtom, sel);

    set(loadingStateAtom, { status: "ready" });
  } catch (err) {
    console.error("Failed to initialize SWE-Bench context:", err);
    set(loadingStateAtom, {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

initializeSWEBenchAtom.onMount = (trigger) => {
  trigger();
};
