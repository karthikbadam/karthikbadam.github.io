import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Stat,
} from "@chakra-ui/react";
import { useTransformer } from "../../../../contexts/TransformerContext";
import { useMemo, useEffect, useState } from "react";

export function OverviewPanel() {
  const {
    selectedPromptId,
    selectedMode,
    selectedMetric,
    selectedTokenRange,
    selectedTokenSet,
    selectedLayerRange,
    aggregationMethod,
    queryTokenLayerHeatmap,
    queryTokenHeadHeatmap,
    setSelectedTokenRange,
    setSelectedTokenSet,
    setSelectedLayerRange,
  } = useTransformer();

  const [stats, setStats] = useState<{
    mean: number;
    max: number;
    min: number;
    count: number;
  } | null>(null);

  const [headStats, setHeadStats] = useState<{
    mean: number;
    max: number;
    min: number;
    count: number;
  } | null>(null);

  // Check if a single layer is selected (not a range)
  const selectedLayer = useMemo(() => {
    if (selectedLayerRange && selectedLayerRange[0] === selectedLayerRange[1]) {
      return selectedLayerRange[0];
    }
    return null;
  }, [selectedLayerRange]);

  // Compute aggregated statistics for current selection (Token × Layer)
  useEffect(() => {
    if (!selectedPromptId || !selectedMetric) {
      setStats(null);
      return;
    }

    const loadStats = async () => {
      try {
        const data = await queryTokenLayerHeatmap(
          selectedPromptId,
          selectedMetric,
          aggregationMethod,
          selectedTokenRange,
          selectedLayerRange
        );

        if (data.length === 0) {
          setStats(null);
          return;
        }

        const values = data.map((d) => d.value);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);

        setStats({
          mean,
          max,
          min,
          count: values.length,
        });
      } catch (err) {
        console.error("Failed to load stats:", err);
        setStats(null);
      }
    };

    loadStats();
  }, [
    selectedPromptId,
    selectedMetric,
    aggregationMethod,
    selectedTokenRange,
    selectedLayerRange,
    queryTokenLayerHeatmap,
  ]);

  // Compute Token × Head statistics when a single layer is selected
  useEffect(() => {
    if (!selectedPromptId || !selectedMetric || selectedLayer === null) {
      setHeadStats(null);
      return;
    }

    // Only compute head stats for metrics that make sense for Token × Head view
    const headMetrics = [
      'entropy', 'top1_mass', 'topk_mass', 'diagonal_mass', 'band_mass',
      'contrib_l2', 'contrib_to_argmax_logit', 'contrib_to_argmax_logit_normed'
    ];
    
    if (!headMetrics.includes(selectedMetric)) {
      setHeadStats(null);
      return;
    }

    const loadHeadStats = async () => {
      try {
        const data = await queryTokenHeadHeatmap(
          selectedPromptId,
          selectedLayer,
          selectedMetric
        );

        if (data.length === 0) {
          setHeadStats(null);
          return;
        }

        const values = data.map((d) => d.value);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);

        setHeadStats({
          mean,
          max,
          min,
          count: values.length,
        });
      } catch (err) {
        console.error("Failed to load head stats:", err);
        setHeadStats(null);
      }
    };

    loadHeadStats();
  }, [
    selectedPromptId,
    selectedMetric,
    selectedLayer,
    queryTokenHeadHeatmap,
  ]);

  const selectionSummary = useMemo(() => {
    const parts: string[] = [];
    if (selectedTokenRange) {
      parts.push(`Tokens: ${selectedTokenRange[0]}-${selectedTokenRange[1]}`);
    }
    if (selectedTokenSet.length > 0) {
      parts.push(`Set: ${selectedTokenSet.length} tokens`);
    }
    if (selectedLayerRange) {
      parts.push(`Layers: ${selectedLayerRange[0]}-${selectedLayerRange[1]}`);
    }
    return parts.join(", ") || "No selection";
  }, [selectedTokenRange, selectedTokenSet, selectedLayerRange]);

  const handleClearSelection = () => {
    setSelectedTokenRange(null);
    setSelectedTokenSet([]);
    setSelectedLayerRange(null);
  };

  return (
    <Box
      w="100%"
      bg="bg.surface"
      border="1px solid"
      borderColor="border"
      borderRadius="md"
      p={4}
    >
      <VStack gap={4} align="stretch">
        <Text fontSize="sm" fontWeight="bold" color="gray.fg">
          Overview
        </Text>

        {/* Selection summary */}
        <Box>
          <Text fontSize="xs" color="gray.fg" mb={1}>
            Selection
          </Text>
          <Text fontSize="sm" fontWeight="medium">
            {selectionSummary}
          </Text>
          <Text fontSize="xs" color="gray.fg" mt={1}>
            Mode: {selectedMode} | Metric: {selectedMetric} | Agg: {aggregationMethod}
          </Text>
        </Box>

        {/* Aggregated statistics - Token × Layer */}
        {stats && (
          <Box>
            <Text fontSize="xs" color="gray.fg" mb={1}>
              Token × Layer Stats
            </Text>
            <HStack gap={4}>
              <Stat.Root size="sm">
                <Stat.Label fontSize="xs">Mean</Stat.Label>
                <Stat.ValueText fontSize="sm">{stats.mean.toFixed(4)}</Stat.ValueText>
              </Stat.Root>
              <Stat.Root size="sm">
                <Stat.Label fontSize="xs">Max</Stat.Label>
                <Stat.ValueText fontSize="sm">{stats.max.toFixed(4)}</Stat.ValueText>
              </Stat.Root>
              <Stat.Root size="sm">
                <Stat.Label fontSize="xs">Min</Stat.Label>
                <Stat.ValueText fontSize="sm">{stats.min.toFixed(4)}</Stat.ValueText>
              </Stat.Root>
              <Stat.Root size="sm">
                <Stat.Label fontSize="xs">Count</Stat.Label>
                <Stat.ValueText fontSize="sm">{stats.count}</Stat.ValueText>
              </Stat.Root>
            </HStack>
          </Box>
        )}

        {/* Token × Head statistics when a single layer is selected */}
        {headStats && selectedLayer !== null && (
          <Box>
            <Text fontSize="xs" color="gray.fg" mb={1}>
              Token × Head Stats (Layer {selectedLayer})
            </Text>
            <HStack gap={4}>
              <Stat.Root size="sm">
                <Stat.Label fontSize="xs">Mean</Stat.Label>
                <Stat.ValueText fontSize="sm">{headStats.mean.toFixed(4)}</Stat.ValueText>
              </Stat.Root>
              <Stat.Root size="sm">
                <Stat.Label fontSize="xs">Max</Stat.Label>
                <Stat.ValueText fontSize="sm">{headStats.max.toFixed(4)}</Stat.ValueText>
              </Stat.Root>
              <Stat.Root size="sm">
                <Stat.Label fontSize="xs">Min</Stat.Label>
                <Stat.ValueText fontSize="sm">{headStats.min.toFixed(4)}</Stat.ValueText>
              </Stat.Root>
              <Stat.Root size="sm">
                <Stat.Label fontSize="xs">Count</Stat.Label>
                <Stat.ValueText fontSize="sm">{headStats.count}</Stat.ValueText>
              </Stat.Root>
            </HStack>
          </Box>
        )}

        {/* Quick actions */}
        <HStack gap={2}>
          <Button size="xs" onClick={handleClearSelection} variant="outline">
            Clear Selection
          </Button>
          <Button
            size="xs"
            onClick={() => {
              setSelectedTokenRange(null);
              setSelectedTokenSet([]);
              setSelectedLayerRange(null);
            }}
            variant="outline"
          >
            Reset View
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
}
