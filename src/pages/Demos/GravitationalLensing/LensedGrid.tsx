import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { useAtomValue } from "jotai";
import { isComputingAtom, isReadyAtom } from "./atoms";
import { useColorMode } from "../../../components/ui/color-mode";
import { MosaicChart, ChartDimensions } from "../../../components/MosaicChart";

export function LensedGrid() {
  const isComputing = useAtomValue(isComputingAtom);
  const isReady = useAtomValue(isReadyAtom);
  const { colorMode } = useColorMode();

  const build = useCallback(
    (_: void, { width, height }: ChartDimensions) => {
      // Create Mosaic params for toggles
      const $mesh = vg.Param.value(0);
      const $showBeta = vg.Param.value(1);

      // Use downsampled view (every 10th point = 200x200 = 40,000 points)
      const downsampledSource = vg.sql`(SELECT * FROM lensed_grid WHERE ix % 10 = 0 AND iy % 10 = 0)`;

      return vg.vconcat(
        vg.hconcat(
          vg.menu({
            label: "View: ",
            options: [
              { value: 0, label: "Theta plane (original)" },
              { value: 1, label: "Beta plane (lensed)" },
            ],
            as: $showBeta,
          }),
          vg.hspace(10),
          vg.menu({
            label: "Delaunay Mesh: ",
            options: [
              { value: 0, label: "Hide" },
              { value: 0.2, label: "Show" },
            ],
            as: $mesh,
          })
        ),
        vg.vspace(10),
        vg.plot(
          // Delaunay mesh overlay
          vg.delaunayMesh(vg.from(downsampledSource), {
            x: vg.sql`CASE WHEN ${$showBeta} = 1 THEN beta_x ELSE theta_x END`,
            y: vg.sql`CASE WHEN ${$showBeta} = 1 THEN beta_y ELSE theta_y END`,
            strokeOpacity: $mesh,
            strokeWidth: 0.5,
          }),
          // Raw points
          vg.raster(vg.from("lensed_grid"), {
            x: vg.sql`CASE WHEN ${$showBeta} = 1 THEN beta_x ELSE theta_x END`,
            y: vg.sql`CASE WHEN ${$showBeta} = 1 THEN beta_y ELSE theta_y END`,
            bandwidth: 0,
            pixelSize: 1,
            fill: colorMode === "dark" ? "#60a5fa" : "#2563eb",
          }),
          vg.dot(vg.from("lenses"), {
            x: "cx",
            y: "cy",
            r: vg.sql`e * 80`,
            fill: "orange",
            tip: true,
          }),
          vg.xDomain([-1, 1]),
          vg.yDomain([-1, 1]),
          vg.xAxis(null),
          vg.yAxis(null),
          vg.aspectRatio(1),
          vg.marginLeft(0),
          vg.marginRight(0),
          vg.marginTop(0),
          vg.marginBottom(0),
          vg.width(width),
          vg.height(height - 60)
        )
      );
    },
    [colorMode]
  );

  return (
    <MosaicChart
      title="Lensed Grid"
      subtitle="2000 x 2000 points"
      build={build}
      dependencies={[isComputing, colorMode]}
      isReady={isReady}
    />
  );
}
