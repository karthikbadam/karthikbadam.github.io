import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../../components/MosaicChart";
import { useTransformer } from "../../../../contexts/TransformerContext";

interface AttentionCard2Props {
  layer: number;
}

export function AttentionCard2({ layer }: AttentionCard2Props) {
  const { coordinator } = useTransformer();

  const setup = useCallback(async () => {
    if (!coordinator) return null;
    const viewName = `attn_patterns_l${layer}`;
    await coordinator.exec(`
      CREATE OR REPLACE TEMP VIEW ${viewName} AS
      SELECT * FROM attention_patterns WHERE layer = ${layer}
    `);
    return { viewName };
  }, [coordinator, layer]);

  const build = useCallback(
    (setupResult: { viewName: string } | null, { width, height }: ChartDimensions) => {
      if (!setupResult) return null;

      return vg.plot(
        vg.cell(vg.from(setupResult.viewName), {
          x: "key_pos",
          y: "query_pos",
          fill: "weight",
          fx: "head", // Facet by head
          tip: true,
        }),
        vg.colorScheme("viridis"),
        vg.xLabel("Key Position"),
        vg.yLabel("Query Position"),
        vg.xTicks([0, 5, 10, 15, 20, 25, 30]),
        vg.yTicks([0, 5, 10, 15, 20, 25, 30]),
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
      title="Attention Patterns (Softmax + GQA)"
      subtitle={`Layer ${layer} - 16 heads`}
      setup={setup}
      build={build}
      dependencies={[layer]}
      isReady={coordinator !== null}
    />
  );
}
