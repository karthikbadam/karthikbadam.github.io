import { useState } from "react";
import {
  Box,
  Text,
  VStack,
  Spinner,
  HStack,
  Badge,
  Grid,
  GridItem,
  Button,
  Container,
} from "@chakra-ui/react";
import {
  SWEBenchProvider,
  useSWEBench,
} from "../../../contexts/SWEBenchContext";
import { TraceSelector } from "./TraceSelector";
import { StatsPanel } from "./StatsPanel";
import { DurationByType } from "./DurationByType";
import { SpanDurationOverTime } from "./SpanDurationOverTime";
import { LLMTokensOverTime } from "./LLMTokensOverTime";
import { SpanGantt } from "./SpanGantt";

/**
 * Loading state indicator component
 */
function LoadingIndicator() {
  const { state } = useSWEBench();

  if (state.status === "ready") return null;

  const steps = [
    { key: "initializing", label: "Initializing DuckDB" },
    { key: "loading-parquet", label: "Loading parquet file" },
    { key: "creating-tables", label: "Creating tables" },
    { key: "ready", label: "Ready" },
  ];

  const currentIndex = steps.findIndex(
    (s) => s.key === state.status.split("-")[0] || s.key === state.status
  );

  return (
    <Box p={6} borderRadius="lg" bg="bg.subtle" maxW="400px" mx="auto" mt={10}>
      <Text fontSize="lg" fontWeight="bold" mb={4}>
        Loading SWE-Bench Dashboard
      </Text>
      <VStack align="stretch" gap={2}>
        {steps.map((step, idx) => (
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
            </Text>
          </HStack>
        ))}
      </VStack>
      {state.status === "error" && (
        <Box mt={4} p={3} bg="red.subtle" borderRadius="md">
          <Text color="red.fg" fontSize="sm">
            Error: {(state as { message: string }).message}
          </Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Main dashboard content
 */
function DashboardContent() {
  const { state, traceIdValue } = useSWEBench();
  const [showSelector, setShowSelector] = useState(false);

  if (state.status !== "ready") {
    return <LoadingIndicator />;
  }

  return (
    <Box h="100vh" overflow="hidden" display="flex" flexDirection="column">
      {/* Header and Stats - centered in container */}
      <Container maxW="100ch" px={4} pt={4} pb={2} mx='auto'>
        <Box mb={2}>
          <Text fontSize="xl" fontWeight="bold">
            SWE-Bench Trace Explorer
          </Text>
          <Text fontSize="sm" color="fg.muted">
            {traceIdValue
              ? `Viewing trace: ${traceIdValue.slice(0, 8)}...`
              : "Aggregate view across all traces"}
          </Text>
        </Box>
        <StatsPanel />
      </Container>

      {/* Charts Grid - full width */}
      <Grid
        templateAreas={{
          base: `"toggle" "selector" "charts" "details"`,
          md: `"selector charts" "selector details"`,
        }}
        templateColumns={{ base: "1fr", md: "1fr 3fr" }}
        templateRows={{
          base: "auto auto 1fr 1fr",
          md: "1fr 2fr",
        }}
        gap={2}
        flex={1}
        px={4}
        pb={4}
        overflow="hidden"
      >
        {/* Mobile Toggle Button */}
        <GridItem area="toggle" display={{ base: "block", md: "none" }}>
          <Button
            size="sm"
            variant="outline"
            width="100%"
            onClick={() => setShowSelector(!showSelector)}
          >
            {showSelector ? "Hide Traces" : "Select Trace"}
          </Button>
        </GridItem>

        {/* Trace Selector - collapsible on mobile */}
        <GridItem
          area="selector"
          overflow="auto"
          display={{ base: showSelector ? "block" : "none", md: "block" }}
        >
          <TraceSelector />
        </GridItem>

        {/* Charts Row */}
        <GridItem area="charts" overflow="auto">
          <Grid templateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={2} h="100%">
            <DurationByType />
            <SpanDurationOverTime />
          </Grid>
        </GridItem>

        {/* Details Row */}
        <GridItem area="details" overflow="auto">
          <Grid templateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={2} h="100%">
            <LLMTokensOverTime />
            <SpanGantt />
          </Grid>
        </GridItem>
      </Grid>
    </Box>
  );
}

/**
 * SWEBenchDashboard - Main dashboard page component
 * Wraps content with the SWEBenchProvider context
 */
export function SWEBenchDashboard() {
  return (
    <SWEBenchProvider>
      <DashboardContent />
    </SWEBenchProvider>
  );
}
