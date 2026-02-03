import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { ChartDimensions, MosaicChart } from "../../../components/MosaicChart";
import { useGaia } from "../../../contexts/GaiaContext";

export function HistogramCharts() {
  const { state, brushSelection } = useGaia();

  const build = useCallback(
    (_: void, { width, height }: ChartDimensions) => {
      if (!brushSelection) return null;

      // Calculate width for each histogram (accounting for some spacing)
      const chartWidth = width;
      const chartHeight = Math.floor(height / 2);

      return vg.vconcat(
        vg.plot(
          vg.rectY(vg.from("gaia", { filterBy: brushSelection }), {
            x: vg.bin("phot_g_mean_mag"),
            y: vg.count(),
            fill: "steelblue",
            inset: 0.5,
          }),
          vg.intervalX({ as: brushSelection }),
          vg.xDomain(vg.Fixed),
          vg.yGrid(true),
          vg.xLabel("Magnitude"),
          vg.width(chartWidth),
          vg.height(chartHeight),
          vg.marginLeft(100),
          vg.marginBottom(50),
          vg.marginTop(30)
        ),
        vg.plot(
          vg.rectY(vg.from("gaia", { filterBy: brushSelection }), {
            x: vg.bin("parallax"),
            y: vg.count(),
            fill: "steelblue",
            inset: 0.5,
          }),
          vg.intervalX({ as: brushSelection }),
          vg.xDomain(vg.Fixed),
          vg.yGrid(true),
          vg.xLabel("Parallax (mas)"),
          vg.yScale("sqrt"),
          vg.width(chartWidth),
          vg.height(chartHeight),
          vg.marginLeft(100),
          vg.marginBottom(50),
          vg.marginTop(30)
        )
      );
    },
    [brushSelection]
  );

  return (
    <MosaicChart
      title="Distributions"
      subtitle="Select a range of values"
      build={build}
      dependencies={[brushSelection]}
      isReady={state.status === "ready" && !!brushSelection}
    />
  );
}
