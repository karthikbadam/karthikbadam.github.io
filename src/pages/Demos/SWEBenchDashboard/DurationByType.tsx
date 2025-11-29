import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../components/MosaicChart";
import { useSWEBench } from "../../../contexts/SWEBenchContext";

export function DurationByType() {
  const { state, traceSelection, traceIdValue } = useSWEBench();

  const build = useCallback(
    (_: void, { width, height }: ChartDimensions) => {
      return vg.plot(
        vg.barY(vg.from("spans", { filterBy: traceSelection }), {
          x: "type",
          y: vg.sum("duration"),
          fill: "type",
          tip: true,
        }),
        vg.xLabel("Span Type"),
        vg.yLabel("Duration (s)"),
        vg.colorLabel("Span Type"),
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
      title="Duration by Span Type"
      subtitle={traceIdValue ? "(filtered)" : "(all traces)"}
      build={build}
      dependencies={[traceSelection]}
      isReady={state.status === "ready" && !!traceSelection}
    />
  );
}
