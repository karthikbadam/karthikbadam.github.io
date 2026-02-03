import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import * as vg from "@uwdata/vgplot";
import { useEffect, useRef, useState } from "react";
import {
  SelectionStats,
  useTransformer,
} from "../../../../contexts/TransformerContext";
import { formatLayerLabel, formatValue } from "../utils/formatting";
import { PanelContainer } from "../../../../components/PanelContainer";
import { getMetricInfo, isHeadMetric } from "../config/metrics";

export function LayerDetailsPanel({ layer }: { layer: number }) {
  const { selectedMetric, queryLayerAcrossTokens, coordinator } =
    useTransformer();

  const [stats, setStats] = useState<SelectionStats | null>(null);
  const [headBreakdown, setHeadBreakdown] = useState<number[]>([]);
  const [topTokens, setTopTokens] = useState<
    Array<{ tokenText: string; value: number }>
  >([]);
  const headChartRef = useRef<HTMLDivElement>(null);

  const metricInfo = getMetricInfo(selectedMetric);
  const hasHeadDim = isHeadMetric(selectedMetric);

  useEffect(() => {
    queryLayerAcrossTokens(layer, selectedMetric).then((data) => {
      setStats(data.stats);
      setHeadBreakdown(data.headBreakdown);
      setTopTokens(data.topTokens);
    });
  }, [layer, selectedMetric, queryLayerAcrossTokens]);

  useEffect(() => {
    if (!headChartRef.current || !coordinator || headBreakdown.length === 0)
      return;

    const viewName = `layer_detail_${layer}`;
    const values = headBreakdown
      .map((value, head) => `(${head}, ${value})`)
      .join(", ");
    const createViewSQL = `CREATE OR REPLACE TEMP VIEW ${viewName} AS SELECT * FROM (VALUES ${values}) AS t(head, value)`;

    coordinator.exec(createViewSQL).then(() => {
      const spec = vg.plot(
        vg.barX(vg.from(viewName), {
          y: "head",
          x: "value",
          fill: "steelblue",
          tip: true,
        }),
        vg.width(500),
        vg.height(400),
        vg.marginTop(5),
        vg.marginLeft(50),
        vg.marginBottom(50)
      );

      if (headChartRef.current) {
        headChartRef.current.innerHTML = "";
        headChartRef.current.appendChild(spec);
      }
    });
  }, [headBreakdown, coordinator, layer]);

  return (
    <PanelContainer h="100%">
      <Text fontSize="xs" fontWeight="semibold" color="accentSubtle" mb={2}>
        Layer Details
      </Text>
      <Text fontSize="xs" color="fg.muted" mb={2}>
        {formatLayerLabel(layer, 36)}
        <Text as="span" fontWeight="normal">
          {" • Metric: "}
          {metricInfo?.label || selectedMetric}
        </Text>
      </Text>

      <VStack align="stretch" gap={2} flex={1}>
        {/* Statistics */}
        {stats && (
          <Box>
            <Text fontSize="xs" color="fg.muted" mb={1}>
              Statistics
            </Text>
            <VStack gap={0.5} align="stretch" fontSize="xs">
              <HStack justify="space-between">
                <Text color="fg.muted">Mean</Text>
                <Text fontFamily="mono">{formatValue(stats.mean)}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="fg.muted">Std</Text>
                <Text fontFamily="mono">{formatValue(stats.std)}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color="fg.muted">Max</Text>
                <Text fontFamily="mono">{formatValue(stats.max)}</Text>
              </HStack>
            </VStack>
          </Box>
        )}

        {/* Head breakdown chart */}
        {hasHeadDim && headBreakdown.length > 0 && (
          <Box w="100%">
            <Text fontSize="xs" color="fg.muted" mb={1}>
              By Head (all {headBreakdown.length})
            </Text>
            <Box ref={headChartRef} w="100%" />
          </Box>
        )}

        {/* Top tokens */}
        {topTokens.length > 0 && (
          <Box>
            <Text fontSize="xs" color="fg.muted" mb={1}>
              Top Tokens
            </Text>
            <VStack gap={0.5} align="stretch" fontSize="xs">
              {topTokens.slice(0, 20).map((t, i) => (
                <HStack key={i} justify="space-between">
                  <Text truncate maxW="140px">
                    {t.tokenText}
                  </Text>
                  <Text fontFamily="mono">{formatValue(t.value)}</Text>
                </HStack>
              ))}
            </VStack>
          </Box>
        )}
      </VStack>
    </PanelContainer>
  );
}
