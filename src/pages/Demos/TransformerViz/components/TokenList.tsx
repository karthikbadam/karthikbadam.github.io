import { useState } from "react";
import { Box, Text, HStack, VStack } from "@chakra-ui/react";
import { Tooltip } from "../../../../components/ui/tooltip";
import { useTransformer } from "../../../../contexts/TransformerContext";
import { MiniBarChart } from "./MiniBarChart";
import { calculateStats } from "../utils/interpretability";

/**
 * TokenList - Left panel showing tokens with mini bar charts
 *
 * Shows all tokens for the selected prompt with:
 * - Position number and token text
 * - Mini bar chart showing metric values across layers
 *
 * Clicking a token selects it and highlights that row in the heatmap.
 */
export function TokenList() {
  const {
    promptTokens,
    $tokenHighlight,
    tokenMetrics,
    setHighlightedToken: setContextHighlightedToken,
  } = useTransformer();

  // Local state for UI styling only
  const [highlightedToken, setHighlightedToken] = useState<number | null>(null);

  return (
    <Box
      bg="bg.panel"
      borderRadius="lg"
      p={2}
      border="1px solid"
      borderColor="gray.subtle"
      h="100%"
      display="flex"
      flexDirection="column"
    >
      <Text fontSize="xs" fontWeight="semibold" color="accentSubtle" mb={2}>
        Tokens
        <Text as="span" fontWeight="normal" color="fg.muted" ml={1}>
          ({promptTokens.length})
        </Text>
      </Text>

      <Box flex={1} overflowY="auto">
        <VStack gap={0} align="stretch">
          {promptTokens.map((token) => {
            const isSelected = highlightedToken === token.position;
            const barData = tokenMetrics?.get(token.position);
            const stats = calculateStats(barData);

            return (
              <Tooltip
                key={token.position}
                content={
                  <VStack gap={0} align="start" fontSize="xs">
                    <Text fontWeight="semibold">{token.token_text}</Text>
                    <Text>Position: ({token.position.toString().padStart(2, '0')})</Text>
                    <Text>Type: {token.is_input ? "Input" : "Generated"}</Text>
                    <Text>Mean: {stats.mean.toFixed(3)}</Text>
                    <Text>Max: {stats.max.toFixed(3)}</Text>
                  </VStack>
                }
                positioning={{ placement: "right" }}
              >
                <HStack
                  gap={2}
                  py={1}
                  cursor="pointer"
                  onClick={() => {
                    if (!$tokenHighlight) return;
                    const newToken = highlightedToken === token.position ? null : token.position;
                    setHighlightedToken(newToken);
                    setContextHighlightedToken(newToken); // Update context for DetailsPanel
                    
                    // Update Mosaic selection (this will propagate to heatmaps automatically)
                    if (newToken !== null) {
                      $tokenHighlight.update({value: [{position: newToken}]});
                    } else {
                      $tokenHighlight.update({value: []});
                    }
                  }}
                  bg={isSelected ? "blue.subtle" : "transparent"}
                  _hover={{ bg: isSelected ? "blue.subtle" : "bg.subtle" }}
                  borderRadius="sm"
                  transition="all 0.1s"
                >
                  {/* Position + token text */}
                  <Text
                    fontSize="xs"
                    fontFamily="mono"
                    w="140px"
                    truncate
                    color={isSelected ? "accent" : "fg"}
                    fontWeight={isSelected ? "semibold" : "normal"}
                  >
                    ({token.position.toString().padStart(2, '0')}) {token.token_text}
                  </Text>

                  {/* Mini bar chart showing metric across layers */}
                  <Box flex={1} color={isSelected ? "accent" : "fg.muted"}>
                    <MiniBarChart data={barData} width={40} height={12} vertical />
                  </Box>
                </HStack>
              </Tooltip>
            );
          })}
        </VStack>
      </Box>
    </Box>
  );
}
