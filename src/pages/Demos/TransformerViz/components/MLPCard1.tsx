import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../../components/MosaicChart";
import { useTransformer } from "../../../../contexts/TransformerContext";

interface MLPCard1Props {
  layer: number;
}

export function MLPCard1({ layer }: MLPCard1Props) {
  const { coordinator } = useTransformer();

  const setup = useCallback(async () => {
    if (!coordinator) return null;
    const viewName = `mlp_intermediate_l${layer}`;
    // Compute norm from values list for gate activations
    // Gate projection output goes through SiLU(x) = x * sigmoid(x)
    // This shows the distribution of gate values that control the gating
    await coordinator.exec(`
      CREATE OR REPLACE TEMP VIEW ${viewName} AS
      SELECT 
        layer,
        position,
        stage,
        SQRT(LIST_SUM(LIST_TRANSFORM(values, x -> x * x))) as norm
      FROM mlp_activations 
      WHERE layer = ${layer} AND stage = 'gate'
    `);
    return { viewName };
  }, [coordinator, layer]);

  const build = useCallback(
    (setupResult: { viewName: string } | null, { width, height }: ChartDimensions) => {
      if (!setupResult) return null;

      return vg.plot(
        vg.rectY(vg.from(setupResult.viewName), {
          x: vg.bin("norm"),
          y: vg.count(),
          fill: "orange",
          tip: true,
        }),
        vg.xLabel("Activation Norm"),
        vg.yLabel("Count"),
        vg.xTicks([0, 5, 10, 15, 20, 25, 30, 35, 40]),
        vg.yTicks([0, 10, 20, 30, 40, 50, 60]),
        vg.width(width),
        vg.height(height),
        vg.marginLeft(60),
        vg.marginBottom(40),
        vg.marginTop(30)
      );
    },
    []
  );

  return (
    <MosaicChart
      title="SiLU Activation & Gating"
      subtitle={`Layer ${layer} - Gate projection activations`}
      setup={setup}
      build={build}
      dependencies={[layer]}
      isReady={coordinator !== null}
    />
  );
}
