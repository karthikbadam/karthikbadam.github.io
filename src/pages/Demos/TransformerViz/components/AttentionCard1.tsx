import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../../components/MosaicChart";
import { useTransformer } from "../../../../contexts/TransformerContext";

interface AttentionCard1Props {
  layer: number;
}

export function AttentionCard1({ layer }: AttentionCard1Props) {
  const { coordinator } = useTransformer();

  const setup = useCallback(async () => {
    if (!coordinator) return null;
    const viewName = `attn_scores_l${layer}`;
    // Create view for attention scores (pre-softmax Q·K^T)
    await coordinator.exec(`
      CREATE OR REPLACE TEMP VIEW ${viewName} AS
      SELECT query_pos, key_pos, score, head
      FROM attention_scores
      WHERE layer = ${layer}
      ORDER BY head, query_pos, key_pos
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
          fill: "score",
          fx: "head",
          tip: true,
        }),
        vg.colorScheme("rdylbu"),
        vg.xLabel("Key Position"),
        vg.yLabel("Query Position"),
        vg.xTicks([0, 5, 10, 15, 20, 25, 30]),
        vg.yTicks([0, 5, 10, 15, 20, 25, 30]),
        vg.width(width),
        vg.height(height),
        vg.marginLeft(80),
        vg.marginBottom(60),
        vg.marginTop(30)
      );
    },
    []
  );

  return (
    <MosaicChart
      title="Attention Scores (Q·K^T)"
      subtitle={`Layer ${layer} - Raw logits before softmax`}
      setup={setup}
      build={build}
      dependencies={[layer]}
      isReady={coordinator !== null}
    />
  );
}
