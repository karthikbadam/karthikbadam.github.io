import {
  Badge,
  Box,
  Button,
  Container,
  Dialog,
  Grid,
  GridItem,
  Heading,
  HStack,
  Link,
  Portal,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useState } from "react";
import { Page } from "../../../components/Page";
import {
  SWEBenchProvider,
  useSWEBench,
} from "../../../contexts/SWEBenchContext";
import { DurationByType } from "./DurationByType";
import { LLMTokensOverTime } from "./LLMTokensOverTime";
import { SpanDurationOverTime } from "./SpanDurationOverTime";
import { SpanGantt } from "./SpanGantt";
import { StatsPanel } from "./StatsPanel";
import { TraceSelector } from "./TraceSelector";

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
    { key: "updating-tables", label: "Updating tables" },
    { key: "ready", label: "Ready" },
  ];

  const currentIndex = steps.findIndex(
    (s) => s.key === state.status.split("-")[0] || s.key === state.status
  );

  return (
    <Box p={6} borderRadius="lg" maxW="400px" mx="auto" mt={10}>
      <Text fontSize="lg" fontWeight="bold" mb={4}>
        Loading SWE-Bench Traces
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
              {state.status === "updating-tables" && idx === currentIndex && (
                <Text as="span" color="blue.500" ml={2}>
                  ({(state as { message: string }).message})
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
  const { state } = useSWEBench();
  const [showSelector, setShowSelector] = useState(false);

  if (state.status !== "ready") {
    return <LoadingIndicator />;
  }

  return (
    <Box
      h={{ base: "auto", md: "100%" }}
      overflow="hidden"
      display="flex"
      flexDirection="column"
      bg="bg.muted"
      pb={2}
    >
      {/* Header and Stats - centered in container */}
      <Container maxW="85ch" px={4} py={4} mx="auto">
        <Box mb={2}>
          <Heading as="h1" size="lg" color="accent" mb={1}>
            Visualizing ML Traces from SWE-Bench
          </Heading>
          <HStack gap={2} alignItems="baseline">
            <Text fontSize="sm" color="gray.fg">
              Traces are a powerful abstraction for tracking operations across
              complex agentic systems.
            </Text>
            <Dialog.Root>
              <Dialog.Trigger asChild>
                <Link
                  fontSize="sm"
                  color="accent"
                  cursor="pointer"
                  whiteSpace="nowrap"
                >
                  Read more
                </Link>
              </Dialog.Trigger>
              <Portal>
                <Dialog.Backdrop />
                <Dialog.Positioner>
                  <Dialog.Content maxW="600px">
                    <Dialog.Header>
                      <Dialog.Title color="accent">
                        About the Trace Visualizations
                      </Dialog.Title>
                    </Dialog.Header>
                    <Dialog.Body pb={6}>
                      <VStack gap={4} align="stretch">
                        <Text fontSize="sm" color="gray.fg">
                          Agentic Systems are becoming more common. From
                          ChatGPT's Agent mode to Perplexity's Comet browser, we
                          are entering a new era of augmented web tools. In such
                          a world, we need structured ways to measure success of
                          these experiences through observability,
                          OpenTelemetry, and traces.
                        </Text>
                        <Text fontSize="sm" color="gray.fg">
                          A trace starts with an origin that defines a trace ID
                          along with an operational context. You can attach this
                          trace ID to a "span" of the application (i.e., to the
                          logs coming out the span of a code block). A collector
                          service can stitch these spans into a trace using the
                          common trace ID.
                        </Text>
                        <Text fontSize="sm" color="gray.fg">
                          This page explores agent traces from a{" "}
                          <Link
                            href="https://huggingface.co/datasets/PatronusAI/TRAIL"
                            target="_blank"
                          >
                            SWE-Bench evaluation dataset
                          </Link>
                          , revealing performance patterns and the{" "}
                          <Link
                            href="https://arxiv.org/abs/2210.03629"
                            target="_blank"
                          >
                            ReAct
                          </Link>{" "}
                          (Reasoning + Acting) framework and key failures faced
                          by{" "}
                          <Link
                            href="https://www.anthropic.com/news/claude-3-7-sonnet"
                            target="_blank"
                          >
                            Claude Sonnet 3.7
                          </Link>
                          .
                        </Text>
                        <Text fontSize="sm" color="gray.fg">
                          Made with{" "}
                          <Link
                            href="https://idl.uw.edu/mosaic/"
                            target="_blank"
                          >
                            UW's Mosaic Chart library.
                          </Link>
                        </Text>
                      </VStack>
                    </Dialog.Body>
                    <Dialog.CloseTrigger />
                  </Dialog.Content>
                </Dialog.Positioner>
              </Portal>
            </Dialog.Root>
          </HStack>
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
          <Grid
            templateColumns={{ base: "1fr", sm: "1fr 1fr" }}
            gap={2}
            h="100%"
          >
            <DurationByType />
            <SpanDurationOverTime />
          </Grid>
        </GridItem>

        {/* Details Row */}
        <GridItem area="details" overflow="auto">
          <Grid
            templateColumns={{ base: "1fr", sm: "1fr 1fr" }}
            gap={2}
            h="100%"
          >
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
 * Wraps content with the SWEBenchProvider context and Page for nav/footer
 */
export function SWEBenchDashboard() {
  return (
    <Page>
      <SWEBenchProvider>
        <DashboardContent />
      </SWEBenchProvider>
    </Page>
  );
}
