import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { useAtomValue } from "jotai";
import { MosaicChart, ChartDimensions } from "../../../components/MosaicChart";
import { isReadyAtom, traceIdValueAtom, traceSelectionAtom } from "./atoms";

export function DurationByType() {
  const isReady = useAtomValue(isReadyAtom);
  const traceSelection = useAtomValue(traceSelectionAtom);
  const traceIdValue = useAtomValue(traceIdValueAtom);

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
      isReady={isReady && !!traceSelection}
    />
  );
}
