import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../../components/MosaicChart";
import { useTransformer } from "../../../../contexts/TransformerContext";

interface MLPCard0Props {
  layer: number;
}

export function MLPCard0({ layer }: MLPCard0Props) {
  const { coordinator } = useTransformer();

  const setup = useCallback(async () => {
    if (!coordinator) return null;
    const gateView = `gate_weights_l${layer}`;
    const upView = `up_weights_l${layer}`;
    // Query split raw_weights files for this specific layer and roles
    const baseUrl = window.location.origin;
    const hashBase = window.location.pathname.replace(/\/$/, "");
    const dataPath = `${baseUrl}${hashBase}/data/llm`;
    const gateFile = `raw_weights_l${layer}_gate.parquet`;
    const upFile = `raw_weights_l${layer}_up.parquet`;
    
    // Create views with computed block-level stats from raw_weights (direct file query)
    await coordinator.exec(`
      CREATE OR REPLACE TEMP VIEW ${gateView} AS
      WITH expanded AS (
        SELECT 
          row_idx,
          CAST((row_idx / 128) AS INTEGER) as out_block,
          UNNEST(GENERATE_SERIES(0, col_end - 1)) as col_idx,
          UNNEST(values) as weight_val
        FROM '${dataPath}/${gateFile}'
      ),
      block_aggregated AS (
        SELECT 
          CAST((col_idx / 128) AS INTEGER) as in_block,
          out_block,
          SQRT(SUM(POW(weight_val, 2))) as fro_norm
        FROM expanded
        GROUP BY in_block, out_block
      )
      SELECT in_block, out_block, fro_norm
      FROM block_aggregated;
      
      CREATE OR REPLACE TEMP VIEW ${upView} AS
      WITH expanded AS (
        SELECT 
          row_idx,
          CAST((row_idx / 128) AS INTEGER) as out_block,
          UNNEST(GENERATE_SERIES(0, col_end - 1)) as col_idx,
          UNNEST(values) as weight_val
        FROM '${dataPath}/${upFile}'
      ),
      block_aggregated AS (
        SELECT 
          CAST((col_idx / 128) AS INTEGER) as in_block,
          out_block,
          SQRT(SUM(POW(weight_val, 2))) as fro_norm
        FROM expanded
        GROUP BY in_block, out_block
      )
      SELECT in_block, out_block, fro_norm
      FROM block_aggregated
    `);
    return { gateView, upView };
  }, [coordinator, layer]);

  const build = useCallback(
    (setupResult: { gateView: string; upView: string } | null, { width, height }: ChartDimensions) => {
      if (!setupResult) return null;

      return vg.vconcat(
        vg.plot(
          vg.cell(vg.from(setupResult.gateView), {
            x: "in_block",
            y: "out_block",
            fill: "fro_norm",
            inset: 0.5,
            tip: true,
          }),
          vg.colorScheme("ylorbr"),
          vg.xLabel("Input Block"),
          vg.yLabel("Output Block"),
          vg.xTicks([0, 4, 8, 12, 16]),
          vg.yTicks([0, 8, 16, 24, 32, 40, 48, 56, 63]),
          vg.width(width),
          vg.height(height * 0.5),
          vg.marginLeft(60),
          vg.marginBottom(40),
          vg.marginTop(20)
        ),
        vg.plot(
          vg.cell(vg.from(setupResult.upView), {
            x: "in_block",
            y: "out_block",
            fill: "fro_norm",
            inset: 0.5,
            tip: true,
          }),
          vg.colorScheme("ylorbr"),
          vg.xLabel("Input Block"),
          vg.yLabel("Output Block"),
          vg.xTicks([0, 4, 8, 12, 16]),
          vg.yTicks([0, 8, 16, 24, 32, 40, 48, 56, 63]),
          vg.width(width),
          vg.height(height * 0.5),
          vg.marginLeft(60),
          vg.marginBottom(40)
        )
      );
    },
    []
  );

  return (
    <MosaicChart
      title="Gate & Up Projections"
      subtitle={`Layer ${layer} - Parallel expansion`}
      setup={setup}
      build={build}
      dependencies={[layer]}
      isReady={coordinator !== null}
    />
  );
}
