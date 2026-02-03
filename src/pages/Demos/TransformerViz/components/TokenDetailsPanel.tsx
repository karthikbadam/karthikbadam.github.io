import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import * as vg from "@uwdata/vgplot";
import { useEffect, useRef, useState } from "react";
import { useTransformer } from "../../../../contexts/TransformerContext";
import { getMetricInfo } from "../config/metrics";
import { formatValue } from "../utils/formatting";
import { PanelContainer } from "../../../../components/PanelContainer";

/**
 * TokenDetailsPanel - Shows detailed statistics for a selected token
 */
export function TokenDetailsPanel({ position }: { position: number }) {
  const { promptTokens, selectedMetric, queryTokenAcrossLayers, coordinator } =
    useTransformer();

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
    const values = layerValues
      .map((value, layer) => `(${layer}, ${value})`)
      .join(", ");
    const createViewSQL = `CREATE OR REPLACE TEMP VIEW ${viewName} AS SELECT * FROM (VALUES ${values}) AS t(layer, value)`;

    coordinator.exec(createViewSQL).then(() => {
      const spec = vg.plot(
        vg.barY(vg.from(viewName), {
          x: "layer",
          y: "value",
          fill: "steelblue",
          tip: true,
        }),
        vg.width(500),
        vg.height(200),
        vg.marginLeft(20),
        vg.marginRight(10),
        vg.marginBottom(50),
        vg.xTickFormat((d: number) => (d % 5 === 0 ? String(d) : "")),
        vg.xTickSize(0)
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
        <HStack justify="space-between" fontSize="xs">
          <Text color="fg.muted">Token {position}</Text>
          <Text fontFamily="mono">{token?.token_text}</Text>
        </HStack>

        {token?.log_prob !== null && token?.log_prob !== undefined && (
          <HStack justify="space-between" fontSize="xs">
            <Text color="fg.muted">Log Prob</Text>
            <Text fontFamily="mono">{formatValue(token.log_prob)}</Text>
          </HStack>
        )}

        {/* Metric across layers chart */}
        <Box w="100%">
          <Text fontSize="xs" color="fg.muted" mb={2}>
            {metricInfo?.label || selectedMetric} Across Layers
          </Text>
          <Box ref={chartRef} w="100%" />
        </Box>
      </VStack>
    </PanelContainer>
  );
}
