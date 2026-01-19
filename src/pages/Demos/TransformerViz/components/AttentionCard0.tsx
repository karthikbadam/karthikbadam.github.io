import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../../components/MosaicChart";
import { useTransformer } from "../../../../contexts/TransformerContext";

interface AttentionCard0Props {
  layer: number;
}

export function AttentionCard0({ layer }: AttentionCard0Props) {
  const { coordinator } = useTransformer();

  const setup = useCallback(async () => {
    if (!coordinator) return null;
    const viewName = `q_weights_l${layer}`;
    // Query split raw_weights file for this specific layer and role
    const baseUrl = window.location.origin;
    const hashBase = window.location.pathname.replace(/\/$/, "");
    const dataPath = `${baseUrl}${hashBase}/data/llm`;
    const qFile = `raw_weights_l${layer}_q.parquet`;
    
    // Create view with computed block-level stats from raw_weights (direct file query)
    await coordinator.exec(`
      CREATE OR REPLACE TEMP VIEW ${viewName} AS
      WITH expanded AS (
        SELECT 
          row_idx,
          CAST((row_idx / 128) AS INTEGER) as head,
          UNNEST(GENERATE_SERIES(0, col_end - 1)) as col_idx,
          UNNEST(values) as weight_val
        FROM '${dataPath}/${qFile}'
      ),
      block_aggregated AS (
        SELECT 
          head,
          CAST((col_idx / 128) AS INTEGER) as in_block,
          SQRT(SUM(POW(weight_val, 2))) as fro_norm
        FROM expanded
        GROUP BY head, in_block
      )
      SELECT head, in_block, fro_norm
      FROM block_aggregated
    `);
    return { viewName };
  }, [coordinator, layer]);

  const build = useCallback(
    (setupResult: { viewName: string } | null, { width, height }: ChartDimensions) => {
      if (!setupResult) return null;

      return vg.plot(
        vg.cell(vg.from(setupResult.viewName), {
          x: "in_block",
          y: "head",
          fill: "fro_norm",
          inset: 0.5,
          tip: true,
        }),
        vg.colorScheme("blues"),
        vg.xLabel("Input Block"),
        vg.yLabel("Head"),
        vg.xTicks([0, 4, 8, 12, 16]),
        vg.yTicks([0, 2, 4, 6, 8, 10, 12, 14, 15]),
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
      title="Input & Projections"
      subtitle={`Layer ${layer} - Q weight matrix blocks`}
      setup={setup}
      build={build}
      dependencies={[layer]}
      isReady={coordinator !== null}
    />
  );
}
