import { Box, Text, VStack, HStack } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { Tooltip } from "../../../../components/ui/tooltip";
import { useTransformer } from "../../../../contexts/TransformerContext";
import { MiniBarChart } from "./MiniBarChart";
import { calculateStats } from "../utils/interpretability";

/**
 * LayerStrip - Compact horizontal strip above heatmap
 *
 * Shows all layers from Embed (-1) to Final (numLayers) with:
 * - Short layer label
 * - Vertical mini bar chart showing metric values across tokens
 *
 * Clicking a layer selects it and highlights that facet in the heatmap.
 */
export function LayerStrip() {
  const {
    numLayers,
    $layerHighlight,
    layerMetrics,
    setHighlightedLayer: setContextHighlightedLayer,
  } = useTransformer();

  // Local state for UI styling only
  const [highlightedLayer, setHighlightedLayer] = useState<number | null>(null);

  // Build layer list: L0-L35 only
  const layers = useMemo(
    () => Array.from({ length: numLayers }, (_, i) => ({ idx: i, label: `${i}` })),
    [numLayers]
  );

  return (
    <Box
      bg="bg.panel"
      borderRadius="lg"
      px={2}
      py={1}
      border="1px solid"
      borderColor="gray.subtle"
      overflowX="auto"
    >
      <HStack gap={0}>
        {layers.map(({ idx, label }) => {
          const isSelected = highlightedLayer === idx;
          const barData = layerMetrics?.get(idx);
          const stats = calculateStats(barData);

          return (
            <Tooltip
              key={idx}
              content={
                <VStack gap={0} align="start" fontSize="xs">
                  <Text fontWeight="semibold">{label}</Text>
                  <Text>Mean: {stats.mean.toFixed(3)}</Text>
                  <Text>Max: {stats.max.toFixed(3)}</Text>
                  <Text>Min: {stats.min.toFixed(3)}</Text>
                </VStack>
              }
              positioning={{ placement: "bottom" }}
            >
              <VStack
                gap={0.5}
                px={1}
                py={0.5}
                cursor="pointer"
                onClick={() => {
                  if (!$layerHighlight) return;
                  const newLayer = highlightedLayer === idx ? null : idx;
                  setHighlightedLayer(newLayer);
                  setContextHighlightedLayer(newLayer); // Update context for DetailsPanel

                  // Update Mosaic selection (this will propagate to heatmaps automatically)
                  if (newLayer !== null) {
                    $layerHighlight.update({value: [{layer: newLayer}]});
                  } else {
                    $layerHighlight.update({value: []});
                  }
                }}
                bg={isSelected ? "blue.subtle" : "transparent"}
                _hover={{ bg: isSelected ? "blue.subtle" : "bg.subtle" }}
                borderRadius="sm"
                minW="36px"
                align="center"
                transition="all 0.1s"
              >
                <Text
                  fontSize="xs"
                  fontFamily="mono"
                  color={isSelected ? "accent" : "fg"}
                  fontWeight={isSelected ? "semibold" : "normal"}
                >
                  {label}
                </Text>
                <Box color={isSelected ? "accent" : "fg.muted"}>
                  <MiniBarChart data={barData} width={32} height={10} vertical />
                </Box>
              </VStack>
            </Tooltip>
          );
        })}
      </HStack>
    </Box>
  );
}
