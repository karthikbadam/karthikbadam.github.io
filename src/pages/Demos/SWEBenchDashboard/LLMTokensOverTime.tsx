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

export function LLMTokensOverTime() {
  const isReady = useAtomValue(isReadyAtom);
  const traceSelection = useAtomValue(traceSelectionAtom);
  const traceIdValue = useAtomValue(traceIdValueAtom);
  const getOrCreateView = useSetAtom(getOrCreateViewAtom);

  const setup = useCallback(async () => {
    await getOrCreateView({
      name: "spans_llm_tokens",
      sql: `
      SELECT *, SUBSTRING(trace_id, 1, 8) as trace_label
      FROM spans WHERE type = 'LLM' AND tokens > 0 AND start_time IS NOT NULL
    `,
    });
  }, [getOrCreateView]);

  const build = useCallback(
    (_: void, { width, height }: ChartDimensions) => {
      return vg.plot(
        vg.lineY(vg.from("spans_llm_tokens", { filterBy: traceSelection }), {
          x: "start_time",
          y: "tokens",
          strokeWidth: 1.5,
          curve: "monotone-x",
          z: "trace_id",
        }),
        vg.dot(vg.from("spans_llm_tokens", { filterBy: traceSelection }), {
          x: "start_time",
          y: "tokens",
          z: "trace_id",
          r: 3,
          tip: true,
        }),
        vg.xLabel("Time (s)"),
        vg.yLabel("Tokens"),
        vg.marginLeft(80),
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
      title="LLM Tokens"
      subtitle={traceIdValue ? "(filtered)" : "(by trace)"}
      setup={setup}
      build={build}
      dependencies={[traceSelection, traceIdValue]}
      isReady={isReady && !!traceSelection}
    />
  );
}
