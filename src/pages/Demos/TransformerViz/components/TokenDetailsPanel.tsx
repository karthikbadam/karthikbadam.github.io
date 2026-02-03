import { Text, VStack, HStack, Box } from "@chakra-ui/react";
import { useEffect, useState, useRef } from "react";
import * as vg from "@uwdata/vgplot";
import {
  useTransformer,
  getMetricInfo,
} from "../../../../contexts/TransformerContext";
import { PanelContainer } from "./shared/PanelContainer";
import { formatValue } from "../utils/formatting";
import { DETAIL_PANEL_CHART } from "../utils/styleConstants";

/**
 * TokenDetailsPanel - Shows detailed statistics for a selected token
 */
export function TokenDetailsPanel({ position }: { position: number }) {
  const {
    promptTokens,
    selectedMetric,
    queryTokenAcrossLayers,
    coordinator,
  } = useTransformer();

  const [layerValues, setLayerValues] = useState<number[]>([]);
  const chartRef = useRef<HTMLDivElement>(null);

  const token = promptTokens.find((t) => t.position === position);
  const metricInfo = getMetricInfo(selectedMetric);

  useEffect(() => {
    queryTokenAcrossLayers(position, selectedMetric).then(setLayerValues);
  }, [position, selectedMetric, queryTokenAcrossLayers]);

  useEffect(() => {
    if (!chartRef.current || !coordinator || layerValues.length === 0) return;

    const viewName = `token_detail_${position}`;
    const values = layerValues.map((value, layer) => `(${layer}, ${value})`).join(", ");
    const createViewSQL = `CREATE OR REPLACE TEMP VIEW ${viewName} AS SELECT * FROM (VALUES ${values}) AS t(layer, value)`;

    const {
      width,
      height,
      marginBottom,
      marginLeft,
      marginRight,
      marginTop,
      xTickCount,
    } = DETAIL_PANEL_CHART.tokenAcrossLayers;

    coordinator.exec(createViewSQL).then(() => {
      const spec = vg.plot(
        vg.barY(vg.from(viewName), {
          x: "layer",
          y: "value",
          fill: "steelblue",
          tip: true,
        }),
        vg.width(width),
        vg.height(height),
        vg.marginBottom(marginBottom),
        vg.marginLeft(marginLeft),
        vg.marginRight(marginRight),
        vg.marginTop(marginTop),
        vg.xLabel(null),
        vg.yLabel(null),
        vg.xTicks(xTickCount)
      );

      if (chartRef.current) {
        chartRef.current.innerHTML = "";
        chartRef.current.appendChild(spec);
      }
    });
  }, [layerValues, coordinator, position]);

  return (
    <PanelContainer>
      <Text fontSize="xs" fontWeight="semibold" color="accentSubtle" mb={2}>
        Token Details
      </Text>

      <VStack align="stretch" gap={2} flex={1} overflow="auto">
        {/* Token info */}
        <Box>
          <Text fontSize="xs" color="fg.muted" mb={1}>
            Token {position}: "{token?.token_text}"
            {token?.is_input ? " (Input)" : " (Generated)"}
          </Text>
        </Box>

        {token?.log_prob !== null && token?.log_prob !== undefined && (
          <HStack justify="space-between" fontSize="xs">
            <Text color="fg.muted">Log Prob</Text>
            <Text fontFamily="mono">{formatValue(token.log_prob)}</Text>
          </HStack>
        )}

        {/* Metric across layers chart */}
        <Box w="100%">
          <Text fontSize="xs" color="fg.muted" mb={1}>
            {metricInfo?.label || selectedMetric} Across Layers
          </Text>
          <Box
            ref={chartRef}
            w="100%"
            minW={DETAIL_PANEL_CHART.tokenAcrossLayers.width}
            h={DETAIL_PANEL_CHART.tokenAcrossLayers.height}
          />
        </Box>
      </VStack>
    </PanelContainer>
  );
}
