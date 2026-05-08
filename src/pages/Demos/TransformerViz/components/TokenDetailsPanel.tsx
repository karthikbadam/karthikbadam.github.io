import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import * as vg from "@uwdata/vgplot";
import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import {
  coordinatorAtom,
  promptTokensAtom,
  selectedMetricAtom,
  selectedPromptIdAtom,
} from "../atoms";
import { getMetricInfo } from "../config/metrics";
import { formatValue } from "../utils/formatting";
import { PanelContainer } from "../../../../components/PanelContainer";
import { buildTokenDetailViewQuery } from "../utils/queryBuilders";

/**
 * TokenDetailsPanel - Shows detailed statistics for a selected token
 */
export function TokenDetailsPanel({ position }: { position: number }) {
  const promptTokens = useAtomValue(promptTokensAtom);
  const selectedMetric = useAtomValue(selectedMetricAtom);
  const coordinator = useAtomValue(coordinatorAtom);
  const selectedPromptId = useAtomValue(selectedPromptIdAtom);

  const chartRef = useRef<HTMLDivElement>(null);

  const token = promptTokens.find((t) => t.position === position);
  const metricInfo = getMetricInfo(selectedMetric);

  useEffect(() => {
    if (!chartRef.current || !coordinator || selectedPromptId === null) return;

    const viewName = `token_detail_${position}`;
    const query = buildTokenDetailViewQuery(viewName, selectedPromptId, position, selectedMetric);
    if (!query) return;

    coordinator.exec(query).then(() => {
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
  }, [position, selectedMetric, coordinator, selectedPromptId]);

  return (
    <PanelContainer>
      <Text fontSize="xs" fontWeight="semibold" color="accentSubtle" mb={2}>
        Token Details
      </Text>

      <VStack align="stretch" gap={1} flex={1} overflow="auto">
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
