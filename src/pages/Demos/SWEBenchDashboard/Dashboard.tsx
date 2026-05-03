import {
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
  Text,
  VStack,
} from "@chakra-ui/react";
import { useState } from "react";
import { Page } from "../../../components/Page";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
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
 * Main dashboard content
 */
function DashboardContent() {
  const { state } = useSWEBench();
  const [showSelector, setShowSelector] = useState(false);

  if (state.status !== "ready") {
    return <LoadingIndicator state={state} title="Loading SWE-Bench Traces" />;
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
          <HStack gap={2} alignItems="baseline" flexWrap="wrap">
            <Text fontSize="sm" color="fg.muted">
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
