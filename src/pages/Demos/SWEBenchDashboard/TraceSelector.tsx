import { Text } from "@chakra-ui/react";
import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../components/MosaicChart";
import { useSWEBench } from "../../../contexts/SWEBenchContext";

export function TraceSelector() {
  const { state, traceSelection, traceIdValue, clearSelection, getOrCreateView } = useSWEBench();

  const setup = useCallback(async () => {
    await getOrCreateView("trace_selector_view", `
      SELECT *, SUBSTRING(trace_id, 1, 8) || '...' as trace_label 
      FROM trace_metrics ORDER BY total_duration DESC
    `);
  }, [getOrCreateView]);

  const build = useCallback(
    (_: void, { width, height }: ChartDimensions) => {
      return vg.plot(
        vg.barX(vg.from("trace_selector_view"), {
          x: "total_duration",
          y: "trace_id",
          fill: "steelblue",
          sort: { y: "-x" },
        }),
        vg.toggleY({ as: traceSelection }),
        vg.highlight({ by: traceSelection }),
        vg.xLabel("Duration (s)"),
        vg.yLabel(null),
        vg.yAxis(null),
        vg.marginLeft(5),
        vg.marginRight(10),
        vg.marginTop(0),
        vg.marginBottom(50),
        vg.width(width),
        vg.height(height)
      );
    },
    [traceSelection]
  );

  return (
    <MosaicChart
      title={`Traces ${traceIdValue ? `· ${traceIdValue.slice(0, 6)}...` : ""}`}
      subtitle={
        traceIdValue ? (
          <Text
            as="span"
            color="blue.500"
            cursor="pointer"
            onClick={clearSelection}
            _hover={{ textDecoration: "underline" }}
          >
            clear
          </Text>
        ) : undefined
      }
      setup={setup}
      build={build}
      dependencies={[traceSelection]}
      isReady={state.status === "ready" && !!traceSelection}
      gridArea="selector"
    />
  );
}
