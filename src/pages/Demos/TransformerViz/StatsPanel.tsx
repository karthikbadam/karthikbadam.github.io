import { Box, Text, VStack, HStack, Badge, Separator } from "@chakra-ui/react";
import { useTransformer } from "../../../contexts/TransformerContext";

function formatNumber(n: number | bigint): string {
  const num = typeof n === "bigint" ? Number(n) : n;
  if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
  return num.toFixed(0);
}

export function StatsPanel() {
  const {
    numLayers,
    numHeads,
    numKVHeads,
    hiddenSize,
    intermediateSize,
    headDim,
    tensors,
    tensorStats,
    headAggregates,
    kvAggregates,
  } = useTransformer();

  // Calculate total parameters from tensors
  const totalParams = tensors.reduce((sum, t) => sum + t.param_count, 0);
  const totalHeads = numLayers * numHeads;
  const totalKVGroups = numLayers * numKVHeads;

  // Calculate average norms
  const avgHeadL2 =
    headAggregates.length > 0
      ? headAggregates.reduce((sum, h) => sum + h.total_l2, 0) / headAggregates.length
      : 0;

  const avgKVL2 =
    kvAggregates.length > 0
      ? kvAggregates.reduce((sum, k) => sum + k.combined_l2, 0) / kvAggregates.length
      : 0;

  // Get embedding stats
  const embedStats = tensorStats.get("embed_tokens");

  return (
    <Box
      bg="bg.panel"
      p={4}
      borderRadius="lg"
      border="1px solid"
      borderColor="gray.subtle"
      h="100%"
      overflow="auto"
    >
      <Text fontSize="sm" fontWeight="semibold" color="accentSubtle" mb={3}>
        Model Overview
      </Text>

      <VStack align="stretch" gap={3}>
        {/* Model ID */}
        <Box>
          <Text fontSize="xs" color="fg.muted" mb={1}>
            Model
          </Text>
          <Text fontSize="sm" fontWeight="medium">
            SmolLM3-3B
          </Text>
        </Box>

        <Separator />

        {/* Architecture Stats */}
        <Box>
          <Text fontSize="xs" color="fg.muted" mb={2}>
            Architecture
          </Text>
          <VStack align="stretch" gap={1}>
            <HStack justify="space-between">
              <Text fontSize="xs">Layers</Text>
              <Badge size="sm">{numLayers}</Badge>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="xs">Hidden Size</Text>
              <Badge size="sm">{formatNumber(hiddenSize)}</Badge>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="xs">MLP Size</Text>
              <Badge size="sm">{formatNumber(intermediateSize)}</Badge>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="xs">Head Dim</Text>
              <Badge size="sm">{headDim}</Badge>
            </HStack>
          </VStack>
        </Box>

        <Separator />

        {/* Attention Stats */}
        <Box>
          <Text fontSize="xs" color="fg.muted" mb={2}>
            Attention (GQA)
          </Text>
          <VStack align="stretch" gap={1}>
            <HStack justify="space-between">
              <Text fontSize="xs">Query Heads</Text>
              <Badge colorPalette="blue" size="sm">
                {numHeads} / layer
              </Badge>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="xs">KV Heads</Text>
              <Badge colorPalette="purple" size="sm">
                {numKVHeads} / layer
              </Badge>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="xs">GQA Ratio</Text>
              <Badge size="sm">{numHeads / numKVHeads}:1</Badge>
            </HStack>
          </VStack>
        </Box>

        <Separator />

        {/* Totals */}
        <Box>
          <Text fontSize="xs" color="fg.muted" mb={2}>
            Totals
          </Text>
          <VStack align="stretch" gap={1}>
            <HStack justify="space-between">
              <Text fontSize="xs">Parameters</Text>
              <Text fontSize="sm" fontWeight="medium" fontFamily="mono">
                {formatNumber(totalParams)}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="xs">Tensors</Text>
              <Text fontSize="sm" fontFamily="mono">
                {tensors.length}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="xs">Total Heads</Text>
              <Text fontSize="sm" fontFamily="mono">
                {totalHeads}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="xs">Total KV Groups</Text>
              <Text fontSize="sm" fontFamily="mono">
                {totalKVGroups}
              </Text>
            </HStack>
          </VStack>
        </Box>

        <Separator />

        {/* Weight Statistics */}
        <Box>
          <Text fontSize="xs" color="fg.muted" mb={2}>
            Weight Statistics
          </Text>
          <VStack align="stretch" gap={1}>
            <HStack justify="space-between">
              <Text fontSize="xs">Avg Q Head L2</Text>
              <Text fontSize="sm" fontFamily="mono">
                {avgHeadL2.toFixed(2)}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="xs">Avg KV L2</Text>
              <Text fontSize="sm" fontFamily="mono">
                {avgKVL2.toFixed(2)}
              </Text>
            </HStack>
            {embedStats && (
              <HStack justify="space-between">
                <Text fontSize="xs">Embed Fro Norm</Text>
                <Text fontSize="sm" fontFamily="mono">
                  {embedStats.fro_norm.toFixed(2)}
                </Text>
              </HStack>
            )}
          </VStack>
        </Box>

        <Separator />

        <HStack>
          <Badge colorPalette="green" size="sm">
            Tied Embeddings
          </Badge>
        </HStack>
      </VStack>
    </Box>
  );
}

