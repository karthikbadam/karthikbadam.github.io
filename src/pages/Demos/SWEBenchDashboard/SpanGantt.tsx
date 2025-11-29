import { useCallback, useMemo, useState, useEffect } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../components/MosaicChart";
import { RecordInspector } from "../../../components/RecordInspector";
import { useSWEBench } from "../../../contexts/SWEBenchContext";

interface GanttSetupResult {
  viewName: string;
  spanCount: number;
}

export function SpanGantt() {
  const { state, traceIdValue, getOrCreateView } = useSWEBench();
  const [spanCount, setSpanCount] = useState(0);
  const [currentViewName, setCurrentViewName] = useState<string | null>(null);
  const [selectedData, setSelectedData] = useState<Record<
    string,
    unknown
  > | null>(null);

  const selection = useMemo(() => vg.Selection.single(), []);

  useEffect(() => {
    setSelectedData(null);
  }, [traceIdValue]);

  // Query selected span data when selection changes
  useEffect(() => {
    const handleSelection = async () => {
      const clauses = selection?.clauses;
      if (
        !clauses?.length ||
        clauses[0].value === undefined ||
        !currentViewName
      ) {
        setSelectedData(null);
        return;
      }

      try {
        const value = clauses[0].value as [number, number];
        const result = await vg.coordinator().query(`
          SELECT * FROM ${currentViewName} WHERE start_time = ${value[0]} LIMIT 1
        `);
        if (result?.numRows > 0) {
          const row = result.get(0);
          const obj: Record<string, unknown> = {};
          for (const field of result.schema.fields) {
            obj[field.name] = row[field.name];
          }
          setSelectedData(obj);
        }
      } catch (err) {
        console.error("Failed to query selected span:", err);
      }
    };

    selection.addEventListener("value", handleSelection);
    return () => selection.removeEventListener("value", handleSelection);
  }, [selection, currentViewName]);

  const setup = useCallback(async (): Promise<GanttSetupResult> => {
    const coordinator = vg.coordinator();
    const baseQuery = `start_time IS NOT NULL AND duration > 0`;

    if (traceIdValue) {
      const countResult = await coordinator.query(`
        SELECT COUNT(*) as cnt FROM spans WHERE trace_id = '${traceIdValue}' AND ${baseQuery}
      `);
      const count = Number(countResult?.get?.(0)?.cnt || 0);
      setSpanCount(count);

      const viewName = `gantt_${traceIdValue.slice(0, 8)}`;
      await getOrCreateView(
        viewName,
        `
        SELECT *, start_time + duration as end_time,
               ROW_NUMBER() OVER (ORDER BY start_time, depth) - 1 as row_index
        FROM spans WHERE trace_id = '${traceIdValue}' AND ${baseQuery}
      `
      );

      setCurrentViewName(viewName);
      return { viewName, spanCount: count };
    } else {
      const countResult = await coordinator.query(`
        SELECT COUNT(*) as total_spans FROM spans WHERE ${baseQuery}
      `);
      const count = Number(countResult?.get?.(0)?.total_spans || 0);
      setSpanCount(count);

      await getOrCreateView(
        "gantt_agg",
        `
        SELECT *, start_time + duration as end_time,
               ROW_NUMBER() OVER (PARTITION BY trace_id ORDER BY start_time) - 1 as row_index
        FROM spans WHERE ${baseQuery}
      `
      );

      setCurrentViewName("gantt_agg");
      return { viewName: "gantt_agg", spanCount: count };
    }
  }, [traceIdValue, getOrCreateView]);

  const build = useCallback(
    (
      { viewName, spanCount }: GanttSetupResult,
      { width, height }: ChartDimensions
    ) => {
      const isAggregate = viewName === "gantt_agg";
      const chartHeight = Math.max(height, Math.min(spanCount * 4, 500));

      return vg.plot(
        vg.rectX(vg.from(viewName), {
          x1: "start_time",
          x2: "end_time",
          y: "row_index",
          fill: "type",
          z: "span_id",
          fillOpacity: isAggregate ? 0.5 : 0.9,
          tip: isAggregate ? true : false,
        }),
        vg.toggleX({ as: selection }),
        vg.highlight({ by: selection }),
        vg.xLabel("Time (s)"),
        vg.colorLabel("Span Type"),
        vg.yAxis(null),
        vg.marginLeft(10),
        vg.marginRight(10),
        vg.marginTop(15),
        vg.marginBottom(40),
        vg.width(width),
        vg.height(chartHeight)
      );
    },
    [selection]
  );

  return (
    <>
      <MosaicChart<GanttSetupResult>
        title="Span Timeline"
        subtitle={`${spanCount.toLocaleString()} spans ${
          !selectedData ? "· Click a span to review its content" : ""
        }`}
        setup={setup}
        build={build}
        dependencies={[traceIdValue]}
        isReady={state.status === "ready"}
      />
      <RecordInspector
        key={traceIdValue}
        data={selectedData}
        title="Span Details"
        onClose={() => setSelectedData(null)}
      />
    </>
  );
}
