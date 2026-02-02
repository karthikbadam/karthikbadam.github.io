import { Text, VStack, HStack, Box } from "@chakra-ui/react";
import { useEffect, useState, useRef } from "react";
import * as vg from "@uwdata/vgplot";
import {
  useTransformer,
  getMetricInfo,
} from "../../../../contexts/TransformerContext";
import { PanelContainer } from "./shared/PanelContainer";
import { formatValue } from "../utils/formatting";

/**
 * TokenDetailsPanel - Shows detailed statistics for a selected token
 */
export function TokenDetailsPanel({ position }: { position: number }) {
  const {
    promptTokens,
    selectedMetric,
    queryTokenAcrossLayers,
  } = useTransformer();

  const [layerValues, setLayerValues] = useState<number[]>([]);
  const chartRef = useRef<HTMLDivElement>(null);

  const token = promptTokens.find((t) => t.position === position);
  const metricInfo = getMetricInfo(selectedMetric);

  useEffect(() => {
    queryTokenAcrossLayers(position, selectedMetric).then(setLayerValues);
  }, [position, selectedMetric, queryTokenAcrossLayers]);

  useEffect(() => {
    if (!chartRef.current || layerValues.length === 0) return;

    const layerData = layerValues.map((value, layer) => ({ layer, value }));

    const spec = vg.plot(
      vg.barY(
        vg.from(layerData),
        {
          x: "layer",
          y: "value",
          fill: "steelblue",
          tip: true,
        }
      ),
      vg.width(240),
      vg.height(100),
      vg.marginBottom(25),
      vg.marginLeft(40),
      vg.marginRight(10),
      vg.marginTop(5),
      vg.xLabel("Layer"),
      vg.yLabel(null)
    );

    chartRef.current.innerHTML = "";
    chartRef.current.appendChild(spec);
  }, [layerValues]);

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
          <Box ref={chartRef} w="100%" />
        </Box>
      </VStack>
    </PanelContainer>
  );
}
