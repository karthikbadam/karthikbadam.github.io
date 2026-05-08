import { Text } from "@chakra-ui/react";
import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { useAtomValue, useSetAtom } from "jotai";
import { MosaicChart, ChartDimensions } from "../../../components/MosaicChart";
import {
  clearTraceSelectionAtom,
  getOrCreateViewAtom,
  isReadyAtom,
  traceIdValueAtom,
  traceSelectionAtom,
} from "./atoms";

export function TraceSelector() {
  const isReady = useAtomValue(isReadyAtom);
  const traceSelection = useAtomValue(traceSelectionAtom);
  const traceIdValue = useAtomValue(traceIdValueAtom);
  const clearSelection = useSetAtom(clearTraceSelectionAtom);
  const getOrCreateView = useSetAtom(getOrCreateViewAtom);

  const setup = useCallback(async () => {
    await getOrCreateView({
      name: "trace_selector_view",
      sql: `
      SELECT *,
        SUBSTRING(trace_id, 1, 10) as trace_label,
        ROUND(total_duration, 1) || 's' as duration_label
      FROM trace_metrics ORDER BY total_duration DESC
    `,
    });
  }, [getOrCreateView]);

  const build = useCallback(
    (_: void, { width, height }: ChartDimensions) => {
      return vg.plot(
        // Duration label at end of bar
        vg.text(vg.from("trace_selector_view"), {
          x: "total_duration",
          y: "trace_id",
          text: "duration_label",
          dx: 4,
          fontSize: 9,
          textAnchor: "start",
        }),
        vg.barX(vg.from("trace_selector_view"), {
          x: "total_duration",
          y: "trace_id",
          fill: "steelblue",
          sort: { y: "-x" },
        }),
        vg.toggleY({ as: traceSelection, channels: ["y"] }),
        vg.highlight({ by: traceSelection }),
        vg.xLabel("Duration (s)"),
        vg.yLabel(null),
        vg.yAxis(null),
        vg.marginLeft(5),
        vg.marginRight(60),
        vg.marginTop(0),
        vg.marginBottom(50),
        vg.width(width),
        vg.height(height)
      );
    },
    [traceSelection]
  );

  const subtitle = traceIdValue ? (
    <>
      <Text as="span" fontSize="xs">
        Selected: {traceIdValue.slice(0, 10)}...
      </Text>
      <Text
        ml={2}
        as="span"
        color="blue.solid"
        cursor="pointer"
        onClick={() => clearSelection()}
        _hover={{ textDecoration: "underline" }}
      >
        clear
      </Text>
    </>
  ) : (
    <Text as="span" color="fg.muted" fontSize="xs">
      Pick a trace to explore
    </Text>
  );

  return (
    <MosaicChart
      title="Traces"
      subtitle={subtitle}
      setup={setup}
      build={build}
      dependencies={[traceSelection]}
      isReady={isReady && !!traceSelection}
      gridArea="selector"
    />
  );
}
