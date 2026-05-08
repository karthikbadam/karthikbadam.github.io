import * as vg from "@uwdata/vgplot";
import { useCallback } from "react";
import { useAtomValue } from "jotai";
import { ChartDimensions, MosaicChart } from "../../../components/MosaicChart";
import { brushSelectionAtom, isReadyAtom } from "./atoms";

export function SkyMap() {
  const brushSelection = useAtomValue(brushSelectionAtom);
  const isReady = useAtomValue(isReadyAtom);
  
  const build = useCallback(
    (_: void, { width, height }: ChartDimensions) => {
      return vg.plot(
        vg.raster(vg.from("gaia", { filterBy: brushSelection }), {
          x: "u",
          y: "v",
          fill: "density",
          bandwidth: 0,
          pixelSize: 1,
        }),
        vg.intervalXY({ as: brushSelection }),
        vg.colorScale("sqrt"),
        vg.colorScheme("Cividis"),
        vg.xAxis(null),
        vg.yAxis(null),
        vg.marginLeft(0),
        vg.marginRight(0),
        vg.marginTop(0),
        vg.marginBottom(0),
        vg.width(width),
        vg.height(height)
      );
    },
    [brushSelection,]
  );

  return (
    <MosaicChart
      title="Sky Map"
      subtitle={"Select a region in the sky map to explore in 3D"}
      build={build}
      dependencies={[brushSelection,]}
      isReady={isReady && !!brushSelection}
    />
  );
}
