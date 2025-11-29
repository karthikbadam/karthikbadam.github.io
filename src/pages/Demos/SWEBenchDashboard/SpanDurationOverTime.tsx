import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../components/MosaicChart";
import { useSWEBench } from "../../../contexts/SWEBenchContext";

export function SpanDurationOverTime() {
  const { state, traceSelection, traceIdValue, getOrCreateView } = useSWEBench();

  const setup = useCallback(async () => {
    await getOrCreateView("spans_duration_time", `
      SELECT * FROM spans WHERE depth > 0 AND start_time IS NOT NULL AND duration > 0
    `);
  }, [getOrCreateView]);

  const build = useCallback(
    (_: void, { width, height }: ChartDimensions) => {
      return vg.plot(
        vg.dot(vg.from("spans_duration_time", { filterBy: traceSelection }), {
          x: "start_time",
          y: "duration",
          fill: "type",
          r: 2,
          tip: true,
        }),
        vg.toggleX({ as: traceSelection }),
        vg.highlight({ by: traceSelection }),
        vg.xLabel("Time (s)"),
        vg.yLabel("Duration (s)"),
        vg.colorLabel("Span Type"),
        vg.yScale("log"),
        vg.marginLeft(50),
        vg.marginRight(10),
        vg.marginTop(25),
        vg.marginBottom(40),
        vg.width(width),
        vg.height(height)
      );
    },
    [traceSelection]
  );

  return (
    <MosaicChart
      title="Span Duration"
      subtitle={traceIdValue ? "(filtered)" : "(all)"}
      setup={setup}
      build={build}
      dependencies={[traceSelection, traceIdValue]}
      isReady={state.status === "ready" && traceSelection}
    />
  );
}
