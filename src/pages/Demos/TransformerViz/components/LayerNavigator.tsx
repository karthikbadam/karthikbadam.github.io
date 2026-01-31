import { Box, Text, Tooltip, VStack, HStack } from "@chakra-ui/react";
import { useTransformer } from "../../../../contexts/TransformerContext";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { LayerPreview } from "./LayerPreview";

export function LayerNavigator() {
  const {
    coordinator,
    selectedPromptId,
    selectedMetric,
    aggregationMethod,
    numLayers,
    queryLayerSummary,
    selectedLayerRange,
    setSelectedLayerRange,
  } = useTransformer();

  const [layerSummaries, setLayerSummaries] = useState<
    Array<{ layer: number; mean: number; max: number; min: number }>
  >([]);
  const [hoveredLayer, setHoveredLayer] = useState<number | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load layer summaries
  useEffect(() => {
    if (!coordinator || selectedPromptId === null || !selectedMetric) {
      setLayerSummaries([]);
      return;
    }

    const loadSummaries = async () => {
      try {
        const summaries = await queryLayerSummary(
          selectedPromptId,
          selectedMetric,
          aggregationMethod === "topk_mean" ? "mean" : aggregationMethod
        );
        setLayerSummaries(summaries);
      } catch (err) {
        console.error("Failed to load layer summaries:", err);
        setLayerSummaries([]);
      }
    };

    loadSummaries();
  }, [
    coordinator,
    selectedPromptId,
    selectedMetric,
    aggregationMethod,
    queryLayerSummary,
  ]);

  // Debounced hover handler
  const handleLayerHover = useCallback(
    (layer: number) => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }

      hoverTimeoutRef.current = setTimeout(() => {
        setHoveredLayer(layer);
      }, 150);
    },
    []
  );

  const handleLayerLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveredLayer(null);
  }, []);

  const handleLayerClick = useCallback(
    (layer: number) => {
      // Toggle layer selection
      if (selectedLayerRange && selectedLayerRange[0] === layer && selectedLayerRange[1] === layer) {
        setSelectedLayerRange(null);
      } else {
        setSelectedLayerRange([layer, layer]);
      }
    },
    [selectedLayerRange, setSelectedLayerRange]
  );

  // Normalize values for visualization
  const normalizedSummaries = useMemo(() => {
    if (layerSummaries.length === 0) return [];
    const allValues = layerSummaries.flatMap((s) => [s.mean, s.max, s.min]);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const range = maxVal - minVal || 1;

    return layerSummaries.map((summary) => ({
      ...summary,
      normalizedMean: (summary.mean - minVal) / range,
      normalizedMax: (summary.max - minVal) / range,
    }));
  }, [layerSummaries]);

  const isLayerSelected = useCallback(
    (layer: number) => {
      if (!selectedLayerRange) return false;
      return layer >= selectedLayerRange[0] && layer <= selectedLayerRange[1];
    },
    [selectedLayerRange]
  );

  return (
    <Box
      w="100%"
      h="100%"
      bg="bg.surface"
      border="1px solid"
      borderColor="border"
      borderRadius="md"
      p={2}
      overflowY="auto"
    >
      <VStack gap={1} align="stretch">
        <Text fontSize="xs" fontWeight="bold" color="gray.fg" mb={1}>
          Layers
        </Text>

        {/* Embedding layer */}
        <Box
          px={2}
          py={1}
          borderRadius="sm"
          bg={isLayerSelected(-1) ? "accent" : "transparent"}
          border="1px solid"
          borderColor={isLayerSelected(-1) ? "accent" : "transparent"}
          cursor="pointer"
          onMouseEnter={() => handleLayerHover(-1)}
          onMouseLeave={handleLayerLeave}
          onClick={() => handleLayerClick(-1)}
        >
          <HStack gap={2}>
            <Text fontSize="xs" minW="40px">
              -1
            </Text>
            <Box flex={1} h="4px" bg="gray.300" borderRadius="sm" />
            <Text fontSize="xs" color="gray.fg">
              Embed
            </Text>
          </HStack>
        </Box>

        {/* Regular layers */}
        {Array.from({ length: numLayers }, (_, i) => i).map((layer) => {
          const summary = normalizedSummaries.find((s) => s.layer === layer);
          const isSelected = isLayerSelected(layer);
          const isHovered = hoveredLayer === layer;

          const layerBox = (
            <Box
              px={2}
              py={1}
              borderRadius="sm"
              bg={
                isSelected
                  ? "accent"
                  : isHovered
                  ? "blue.50"
                  : "transparent"
              }
              border="1px solid"
              borderColor={
                isSelected
                  ? "accent"
                  : isHovered
                  ? "blue.200"
                  : "transparent"
              }
              cursor="pointer"
              onMouseEnter={() => handleLayerHover(layer)}
              onMouseLeave={handleLayerLeave}
              onClick={() => handleLayerClick(layer)}
            >
              <HStack gap={2}>
                <Text fontSize="xs" minW="40px">
                  {layer}
                </Text>
                <Box
                  flex={1}
                  h="4px"
                  bg={summary ? "blue.400" : "gray.300"}
                  borderRadius="sm"
                  position="relative"
                >
                  {summary && (
                    <Box
                      position="absolute"
                      left={0}
                      top={0}
                      h="100%"
                      w={`${summary.normalizedMean * 100}%`}
                      bg="blue.600"
                      borderRadius="sm"
                    />
                  )}
                </Box>
              </HStack>
            </Box>
          );

          return (
            <Tooltip.Root key={layer} openDelay={200}>
              <Tooltip.Trigger asChild>
                <LayerPreview layer={layer}>{layerBox}</LayerPreview>
              </Tooltip.Trigger>
              <Tooltip.Content>
                {summary
                  ? `Layer ${layer}: mean=${summary.mean.toFixed(4)}, max=${summary.max.toFixed(4)}, min=${summary.min.toFixed(4)}`
                  : `Layer ${layer}`}
              </Tooltip.Content>
            </Tooltip.Root>
          );
        })}

        {/* Final norm layer */}
        <Box
          px={2}
          py={1}
          borderRadius="sm"
          bg={isLayerSelected(numLayers) ? "accent" : "transparent"}
          border="1px solid"
          borderColor={isLayerSelected(numLayers) ? "accent" : "transparent"}
          cursor="pointer"
          onMouseEnter={() => handleLayerHover(numLayers)}
          onMouseLeave={handleLayerLeave}
          onClick={() => handleLayerClick(numLayers)}
        >
          <HStack gap={2}>
            <Text fontSize="xs" minW="40px">
              {numLayers}
            </Text>
            <Box flex={1} h="4px" bg="gray.300" borderRadius="sm" />
            <Text fontSize="xs" color="gray.fg">
              Final
            </Text>
          </HStack>
        </Box>
      </VStack>
    </Box>
  );
}
