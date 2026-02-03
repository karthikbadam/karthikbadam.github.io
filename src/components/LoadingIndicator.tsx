import { Badge, Box, HStack, Spinner, Text, VStack } from "@chakra-ui/react";
import { LoadingState } from "../types/loading";

interface LoadingIndicatorProps {
  state: LoadingState;
  title: string;
}

const LOADING_STEPS = [
  { key: "initializing", label: "Initializing DuckDB" },
  { key: "loading-parquet", label: "Loading parquet file" },
  { key: "creating-tables", label: "Creating tables" },
  { key: "updating-tables", label: "Updating tables" },
  { key: "ready", label: "Ready" },
];

export function LoadingIndicator({ state, title }: LoadingIndicatorProps) {
  if (state.status === "ready") return null;

  const currentIndex = LOADING_STEPS.findIndex(
    (s) => s.key === state.status.split("-")[0] || s.key === state.status
  );

  // Extract query from state if available
  const currentQuery =
    (state.status === "creating-tables" || state.status === "updating-tables") &&
    "query" in state
      ? (state as { query?: string }).query
      : null;

  return (
    <Box p={6} borderRadius="lg" maxW="600px" mx="auto" mt={10}>
      <Text fontSize="lg" fontWeight="bold" mb={4}>
        {title}
      </Text>
      <VStack align="stretch" gap={2}>
        {LOADING_STEPS.map((step, idx) => (
          <HStack key={step.key} gap={4}>
            {idx < currentIndex ? (
              <Badge colorPalette="green" size="sm">
                ✓
              </Badge>
            ) : idx === currentIndex ? (
              <Spinner size="sm" />
            ) : (
              <Badge colorPalette="gray" size="sm">
                ○
              </Badge>
            )}
            <Text
              fontSize="sm"
              color={idx <= currentIndex ? "inherit" : "fg.muted"}
              fontWeight={idx === currentIndex ? "bold" : "normal"}
            >
              {step.label}
              {state.status === "creating-tables" && idx === currentIndex && (
                <Text as="span" color="blue.500" ml={2}>
                  ({(state as { table: string }).table})
                </Text>
              )}
              {state.status === "updating-tables" && idx === currentIndex && (
                <Text as="span" color="blue.500" ml={2}>
                  ({(state as { message: string }).message})
                </Text>
              )}
            </Text>
          </HStack>
        ))}
      </VStack>
      {currentQuery && (
        <Box mt={4} p={2} bg="bg.subtle" borderRadius="md" overflow="auto">
          <Text
            fontSize="xs"
            fontFamily="mono"
            whiteSpace="pre-wrap"
            color="fg.muted"
          >
            {currentQuery.trim()}
          </Text>
        </Box>
      )}
      {state.status === "error" && (
        <Box mt={4} p={2} bg="red.subtle" borderRadius="md">
          <Text color="red.fg" fontSize="sm">
            Error: {(state as { message: string }).message}
          </Text>
        </Box>
      )}
    </Box>
  );
}

