import { Box, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { Tooltip } from "../../../../components/ui/tooltip";
import { useTransformer } from "../../../../contexts/TransformerContext";
import { calculateStats } from "../utils/interpretability";
import { MiniBarChart } from "./MiniBarChart";

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
      bg="bg"
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
        <Text as="span" ml={1}>
          ({promptTokens.length})
        </Text>
        <Text as="span" fontWeight="normal" color="fg.muted" ml={1}>
          {"• "}
          {"Select a token"}
        </Text>
      </Text>

      <Box
        flex={1}
        overflowY={{ base: "hidden", md: "auto" }}
        overflowX={{ base: "auto", md: "hidden" }}
      >
        <Box
          display="flex"
          flexDirection={{ base: "row", md: "column" }}
          gap={0}
          alignItems={{ base: "stretch", md: "stretch" }}
        >
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
                    <Text>
                      Position: ({token.position.toString().padStart(2, "0")})
                    </Text>
                    <Text>Type: {token.is_input ? "Input" : "Generated"}</Text>
                    <Text>Mean: {stats.mean.toFixed(3)}</Text>
                    <Text>Max: {stats.max.toFixed(3)}</Text>
                  </VStack>
                }
                positioning={{ placement: "bottom" }}
              >
                <Box
                  display="flex"
                  flexDirection={{ base: "column", md: "row" }}
                  alignItems="center"
                  justifyContent="flex-end"
                  gap={2}
                  px={1}
                  py={{ base: 0.5, md: 1 }}
                  cursor="pointer"
                  onClick={() => {
                    if (!$tokenHighlight) return;
                    const newToken =
                      highlightedToken === token.position
                        ? null
                        : token.position;
                    setHighlightedToken(newToken);
                    setContextHighlightedToken(newToken);

                    if (newToken !== null) {
                      $tokenHighlight.update({
                        value: [{ position: newToken }],
                      });
                    } else {
                      $tokenHighlight.update({ value: [] });
                    }
                  }}
                  bg={isSelected ? "gray.subtle" : "transparent"}
                  _hover={{ bg: "gray.subtle" }}
                  borderRadius="sm"
                  transition="all 0.1s"
                >
                  <Text
                    fontSize="xs"
                    truncate
                    color={isSelected ? "accent" : "fg"}
                    fontWeight={isSelected ? "semibold" : "normal"}
                    w={{ base: "auto", md: "140px" }}
                  >
                    <Text as="span" display={{ base: "none", md: "inline" }}>
                      ({token.position.toString().padStart(2, "0")}){" "}
                    </Text>
                    {token.token_text}
                  </Text>

                  <Box
                    flex={{ md: 1 }}
                    color={isSelected ? "accent" : "fg.muted"}
                  >
                    <MiniBarChart
                      data={barData}
                      width={40}
                      height={12}
                      vertical
                    />
                  </Box>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
