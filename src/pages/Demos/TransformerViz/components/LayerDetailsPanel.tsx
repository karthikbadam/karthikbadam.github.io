import { Text, VStack, HStack, Box } from "@chakra-ui/react";
import { useEffect, useState, useRef } from "react";
import * as vg from "@uwdata/vgplot";
import {
  useTransformer,
  getMetricInfo,
  isHeadMetric,
  SelectionStats,
} from "../../../../contexts/TransformerContext";
import { PanelContainer } from "./shared/PanelContainer";
import { formatValue, formatLayerLabel } from "../utils/formatting";

/**
 * LayerDetailsPanel - Shows detailed statistics for a selected layer
 */
export function LayerDetailsPanel({ layer }: { layer: number }) {
  const {
    selectedMetric,
    queryLayerAcrossTokens,
  } = useTransformer();

  const [stats, setStats] = useState<SelectionStats | null>(null);
  const [headBreakdown, setHeadBreakdown] = useState<number[]>([]);
  const [topTokens, setTopTokens] = useState<Array<{ tokenText: string; value: number }>>([]);
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
    if (!headChartRef.current || headBreakdown.length === 0) return;

    const headData = headBreakdown.map((value, head) => ({ head, value }));
    const chartHeight = headData.length * 13;

    const spec = vg.plot(
      vg.barX(
        vg.from(headData),
        {
          y: "head",
          x: "value",
          fill: "steelblue",
          tip: true,
        }
      ),
      vg.width(240),
      vg.height(chartHeight),
      vg.marginLeft(30),
      vg.marginRight(10),
      vg.marginTop(5),
      vg.marginBottom(5),
      vg.yLabel(null),
      vg.xLabel(null)
    );

    headChartRef.current.innerHTML = "";
    headChartRef.current.appendChild(spec);
  }, [headBreakdown]);

  return (
    <PanelContainer>
      <Text fontSize="xs" fontWeight="semibold" color="accentSubtle" mb={2}>
        Layer Details
      </Text>
      <Text fontSize="xs" color="fg.muted" mb={2}>
        {formatLayerLabel(layer, 36)}
        <Text as="span" fontWeight="normal" ml={1}>
          {" • Metric: "}{metricInfo?.label || selectedMetric}
        </Text>
      </Text>

      <VStack align="stretch" gap={2} flex={1} overflow="auto">
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
              {topTokens.slice(0, 10).map((t, i) => (
                <HStack key={i} justify="space-between">
                  <Text truncate maxW="140px">{t.tokenText}</Text>
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
