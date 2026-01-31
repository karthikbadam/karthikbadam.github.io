import { Box, Button, HStack, Text, Tooltip } from "@chakra-ui/react";
import { useTransformer } from "../../../../contexts/TransformerContext";
import { useCallback, useRef, useState } from "react";

export function TokenStrip() {
  const {
    promptTokens,
    selectedTokenRange,
    setSelectedTokenRange,
    selectedTokenSet,
    addTokenToSet,
    addRangeToSet,
  } = useTransformer();

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (position: number, event: React.MouseEvent) => {
      if (event.shiftKey) {
        // Shift-click: expand range
        if (selectedTokenRange) {
          const [start, end] = selectedTokenRange;
          setSelectedTokenRange([
            Math.min(start, position),
            Math.max(end, position),
          ]);
        } else {
          setSelectedTokenRange([position, position]);
        }
      } else {
        // Regular click: toggle token in set
        addTokenToSet(position);
        // Also start drag for range selection
        setIsDragging(true);
        setDragStart(position);
      }
    },
    [selectedTokenRange, setSelectedTokenRange, addTokenToSet]
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!isDragging || dragStart === null || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const tokenWidth = rect.width / promptTokens.length;
      const endPosition = Math.floor(x / tokenWidth);
      const clampedEnd = Math.max(
        0,
        Math.min(promptTokens.length - 1, endPosition)
      );

      setSelectedTokenRange([
        Math.min(dragStart, clampedEnd),
        Math.max(dragStart, clampedEnd),
      ]);
    },
    [isDragging, dragStart, promptTokens.length]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
  }, []);

  const isTokenSelected = useCallback(
    (position: number) => {
      if (selectedTokenRange) {
        const [start, end] = selectedTokenRange;
        if (position >= start && position <= end) return true;
      }
      return selectedTokenSet.includes(position);
    },
    [selectedTokenRange, selectedTokenSet]
  );

  const truncateToken = useCallback((text: string, maxLen: number = 8) => {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + "...";
  }, []);

  const handleAddRangeToSet = useCallback(() => {
    if (selectedTokenRange) {
      addRangeToSet(selectedTokenRange);
      setSelectedTokenRange(null);
    }
  }, [selectedTokenRange, addRangeToSet, setSelectedTokenRange]);

  if (promptTokens.length === 0) {
    return null;
  }

  return (
    <Box
      ref={containerRef}
      px={4}
      py={2}
      bg="bg.surface"
      borderBottom="1px solid"
      borderColor="border"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <HStack gap={2} align="center">
        <Text fontSize="xs" color="gray.fg" fontWeight="medium" minW="80px">
          Tokens:
        </Text>
        <HStack gap={0.5} flex={1} overflowX="auto">
          {promptTokens.map((token, idx) => {
            const isSelected = isTokenSelected(token.position);
            const isInput = token.is_input;
            const displayText =
              promptTokens.length > 50
                ? truncateToken(token.token_text, 6)
                : token.token_text;

            // Collapse whitespace tokens
            if (token.token_text.trim() === "" && token.token_text !== "") {
              return (
                <Box
                  key={idx}
                  w="2px"
                  h="20px"
                  bg="gray.300"
                  flexShrink={0}
                />
              );
            }

            return (
              <Tooltip.Root key={idx} openDelay={200}>
                <Tooltip.Trigger asChild>
                  <Box
                  as="button"
                  px={1.5}
                  py={0.5}
                  fontSize={promptTokens.length > 50 ? "xs" : "sm"}
                  bg={isSelected ? "accent" : isInput ? "blue.50" : "gray.50"}
                  color={
                    isSelected
                      ? "white"
                      : isInput
                      ? "blue.700"
                      : "gray.700"
                  }
                  border="1px solid"
                  borderColor={
                    isSelected
                      ? "accent"
                      : isInput
                      ? "blue.200"
                      : "gray.200"
                  }
                  borderRadius="sm"
                  cursor="pointer"
                  _hover={{
                    bg: isSelected ? "accent" : isInput ? "blue.100" : "gray.100",
                  }}
                  onClick={(e) => handleMouseDown(token.position, e)}
                  onMouseDown={(e) => handleMouseDown(token.position, e)}
                  flexShrink={0}
                  title={`Position ${token.position}: ${token.token_text}`}
                >
                  {displayText}
                  </Box>
                </Tooltip.Trigger>
                <Tooltip.Content>{token.token_text}</Tooltip.Content>
              </Tooltip.Root>
            );
          })}
        </HStack>
        {selectedTokenRange && (
          <Button
            size="xs"
            onClick={handleAddRangeToSet}
            colorScheme="blue"
            variant="outline"
          >
            Add Range to Set
          </Button>
        )}
      </HStack>
    </Box>
  );
}
