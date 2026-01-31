import { useCallback, useEffect, useState } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../../components/MosaicChart";
import { useTransformer } from "../../../../contexts/TransformerContext";
import { Box, Text } from "@chakra-ui/react";

interface TopKHeadsStripProps {
  layer: number;
  metric: "contrib_l2" | "contrib_to_argmax_logit_normed";
  k?: number;
}

export function TopKHeadsStrip({ layer, metric, k = 5 }: TopKHeadsStripProps) {
  const { coordinator, selectedPromptId, queryTopKHeads } = useTransformer();
  const [topHeads, setTopHeads] = useState<
    Array<{ head: number; position: number; value: number }>
  >([]);

  useEffect(() => {
    if (!coordinator || selectedPromptId === null) {
      setTopHeads([]);
      return;
    }

    const loadTopHeads = async () => {
      try {
        const heads = await queryTopKHeads(selectedPromptId, layer, metric, k);
        setTopHeads(heads);
      } catch (err) {
        console.error("Failed to load top-k heads:", err);
        setTopHeads([]);
      }
    };

    loadTopHeads();
  }, [coordinator, selectedPromptId, layer, metric, k, queryTopKHeads]);

  const setup = useCallback(async (): Promise<{ viewName: string }> => {
    if (!coordinator || selectedPromptId === null) {
      return { viewName: "empty_topk_heads" };
    }

    const viewName = `topk_heads_l${layer}_${metric}`;
    
    // Use the queryTopKHeads result directly via a subquery
    // Since we already have the data in topHeads state, we can create a view from it
    if (topHeads.length === 0) {
      // Create empty view
      await coordinator.exec(`
        CREATE OR REPLACE TEMP VIEW ${viewName} AS
        SELECT CAST(0 AS INTEGER) as head, CAST(0 AS INTEGER) as position, CAST(0.0 AS DOUBLE) as value
        WHERE FALSE
      `);
      return { viewName };
    }
    
    // Create view by querying head_contrib_metrics with the same logic
    const query = `
      CREATE OR REPLACE TEMP VIEW ${viewName} AS
      WITH ranked AS (
        SELECT 
          head,
          position,
          ${metric} as value,
          ROW_NUMBER() OVER (PARTITION BY position ORDER BY ${metric} DESC) as rank
        FROM head_contrib_metrics
        WHERE prompt_id = ${selectedPromptId} AND layer = ${layer}
      )
      SELECT 
        head,
        position,
        value
      FROM ranked
      WHERE rank <= ${k}
      ORDER BY position, head
    `;

    await coordinator.exec(query);
      return { viewName };
  }, [coordinator, selectedPromptId, layer, metric, k, topHeads]);

  const build = useCallback(
    (setupResult: { viewName: string }, { width, height }: ChartDimensions) => {
      if (!setupResult || setupResult.viewName === "empty_topk_heads") return null;

      return vg.plot(
        vg.barX(vg.from(setupResult.viewName), {
          x: "value",
          y: "head",
          fill: "steelblue",
          sort: { y: "-x" },
          tip: true,
        }),
        vg.xLabel(metric),
        vg.yLabel("Head"),
        vg.width(width),
        vg.height(height),
        vg.marginLeft(80),
        vg.marginBottom(30),
        vg.marginTop(10),
        vg.marginRight(10)
      );
    },
    [metric]
  );

  if (topHeads.length === 0) {
    return (
      <Box h="60px" bg="gray.50" borderRadius="sm" display="flex" alignItems="center" justifyContent="center">
        <Text fontSize="xs" color="gray.500">
          Loading top-{k} heads...
        </Text>
      </Box>
    );
  }

  return (
    <Box h="200px">
      <MosaicChart<{ viewName: string }>
        title={`Top-${k} Heads by ${metric}`}
        subtitle={`Layer ${layer}`}
        setup={setup}
        build={build}
        dependencies={[selectedPromptId, layer, metric, topHeads]}
        isReady={coordinator !== null && selectedPromptId !== null && topHeads.length > 0}
        loadingText="Loading top heads..."
      />
    </Box>
  );
}
