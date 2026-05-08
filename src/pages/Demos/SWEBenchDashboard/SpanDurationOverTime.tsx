import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { useAtomValue, useSetAtom } from "jotai";
import { MosaicChart, ChartDimensions } from "../../../components/MosaicChart";
import {
  getOrCreateViewAtom,
  isReadyAtom,
  traceIdValueAtom,
  traceSelectionAtom,
} from "./atoms";

export function SpanDurationOverTime() {
  const isReady = useAtomValue(isReadyAtom);
  const traceSelection = useAtomValue(traceSelectionAtom);
  const traceIdValue = useAtomValue(traceIdValueAtom);
  const getOrCreateView = useSetAtom(getOrCreateViewAtom);

  const setup = useCallback(async () => {
    await getOrCreateView({
      name: "spans_duration_time",
      sql: `
      SELECT * FROM spans WHERE depth > 0 AND start_time IS NOT NULL AND duration > 0
    `,
    });
  }, [getOrCreateView]);

  const build = useCallback(
    (_: void, { width, height }: ChartDimensions) => {
      return vg.plot(
        vg.dot(vg.from("spans_duration_time", { filterBy: traceSelection }), {
          x: "start_time",
          y: "duration",
          fill: "type",
          r: 3,
          tip: {
            format: {
              x: (d: number) => `${d.toFixed(2)}s`,
              y: (d: number) => `${d.toFixed(3)}s`,
              fill: true,
              trace_id: true,
              span_id: true,
              name: true,
            }
          },
          z: "trace_id",
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
      title="Span Duration Over Time"
      subtitle={traceIdValue ? "(filtered)" : "(all traces)"}
      setup={setup}
      build={build}
      dependencies={[traceSelection, traceIdValue]}
      isReady={isReady && !!traceSelection}
    />
  );
}
