import { Box, Container, Heading, Text, NativeSelect, HStack, Drawer, VStack } from "@chakra-ui/react";
import { useState, useMemo } from "react";
import { Page } from "../../../components/Page";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { TransformerProvider, useTransformer, METRIC_CATALOG, getMetricInfo } from "../../../contexts/TransformerContext";
import { Heatmap } from "./components/heatmaps";
import { TokenList } from "./components/TokenList";
import { LayerStrip } from "./components/LayerStrip";
import { DetailsPanel } from "./components/DetailsPanel";

/**
 * Main dashboard content - New 3-panel layout
 *
 * Layout:
 * - Left: TokenList (160px) - tokens with mini bar charts
 * - Center: LayerStrip (40px) + FacetedHeatmap (flex)
 * - Right: DetailsPanel (280px) - token/layer details
 *
 * Uses semantic color tokens: bg.muted, bg.panel, gray.subtle, accent, fg.muted
 */
function DashboardContent() {
  const {
    state,
    numLayers,
    numHeads,
    availablePrompts,
    selectedPromptId,
    setSelectedPromptId,
    selectedMetric,
    setSelectedMetric,
    selectedToken,
    selectedLayer,
    promptTokens,
  } = useTransformer();

  const [showMobileDetails, setShowMobileDetails] = useState(false);

  const metricInfo = getMetricInfo(selectedMetric);

  // Extract response text
  const responseText = useMemo(() => {
    const generatedTokens = promptTokens.filter(t => !t.is_input);
    return generatedTokens.map(t => t.token_text).join('');
  }, [promptTokens]);

  if (state.status !== "ready") {
    return <LoadingIndicator state={state} title="Loading Transformer Architecture" />;
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
      {/* Compact 2-row Header */}
      <Container maxW="100%" px={4} py={2}>
        <VStack align="stretch" gap={1}>
          {/* Row 1: Title + Prompt/Response */}
          <HStack justify="space-between" align="center" gap={4}>
            {/* Left: Title */}
            <Box flexShrink={0}>
              <Heading as="h1" size="lg" color="accent">
                Transformer Activations
              </Heading>
              <Text fontSize="xs" color="fg.muted">
                SmolLM3-3B | {numLayers} layers, {numHeads} heads
              </Text>
            </Box>

            {/* Right: Prompt dropdown + Response */}
            {availablePrompts.length > 0 && (
              <VStack gap={0} align="stretch" flex={1}>
                <HStack gap={1} align="center">
                  <Text fontSize="xs" color="fg.muted" flexShrink={0}>Prompt:</Text>
                  <NativeSelect.Root size="sm" variant="outline">
                    <NativeSelect.Field
                      value={selectedPromptId ?? ""}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setSelectedPromptId(Number(e.target.value))
                      }
                      fontSize="xs"
                    >
                      {availablePrompts.map((prompt) => (
                        <option key={prompt.prompt_id} value={prompt.prompt_id}>
                          {prompt.prompt_text}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </HStack>
                {responseText && (
                  <HStack gap={1}>
                    <Text fontSize="xs" color="fg.muted" flexShrink={0}>Response:</Text>
                    <Text
                      fontSize="xs"
                      color="fg"
                      truncate
                    >
                      {responseText}
                    </Text>
                  </HStack>
                )}
              </VStack>
            )}
          </HStack>

          {/* Row 2: Metric dropdown + Details */}
          <HStack gap={3} align="center" fontSize="xs">
            <HStack gap={1}>
              <Text color="fg.muted" flexShrink={0}>Metric:</Text>
              <NativeSelect.Root size="sm" variant="outline" w="200px">
                <NativeSelect.Field
                  value={selectedMetric}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setSelectedMetric(e.target.value)
                  }
                >
                  <optgroup label="Attention">
                    {METRIC_CATALOG.attention.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Contribution">
                    {METRIC_CATALOG.contribution.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Hidden State">
                    {METRIC_CATALOG.hidden.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="MLP Metrics">
                    {METRIC_CATALOG.mlp.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="MLP Neurons">
                    {METRIC_CATALOG.mlpNeurons.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Hidden Trajectory">
                    {METRIC_CATALOG.hiddenTrajectory.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Layer Norm">
                    {METRIC_CATALOG.layernorm.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </optgroup>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </HStack>
            {metricInfo && (
              <>
                <Text color="fg.muted" flexShrink={0}>•</Text>
                <Text color="fg" truncate>
                  {metricInfo.description}
                </Text>
                <Text color="fg.muted" flexShrink={0}>•</Text>
                <Text color="fg.muted" truncate>
                  {metricInfo.interpretation}
                </Text>
                <Text color="fg.muted" flexShrink={0}>•</Text>
                <Text fontFamily="mono" color="fg.muted" flexShrink={0}>
                  {metricInfo.formula}
                </Text>
              </>
            )}
          </HStack>
        </VStack>
      </Container>

      {/* Three-panel layout */}
      <Box
        flex={1}
        px={4}
        pb={2}
        overflow={{ base: "auto", md: "hidden" }}
        display="flex"
        flexDirection={{ base: "column", md: "row" }}
        gap={4}
        minH={0}
      >
        {/* Left: Token List */}
        <Box
          w={{ base: "100%", md: "200px" }}
          flexShrink={0}
          display={{ base: "none", md: "block" }}
          h={{ md: "100%" }}
        >
          <TokenList />
        </Box>

        {/* Center: Layer Strip + Heatmap */}
        <Box flex={1} minW={0} display="flex" flexDirection="column" h={{ base: "60vh", md: "100%" }}>
          {/* Layer Strip - compact horizontal strip */}
          <Box flexShrink={0} mb={2}>
            <LayerStrip />
          </Box>

          {/* Heatmap takes remaining space */}
          <Box flex={1} minH={0}>
            <Heatmap />
          </Box>
        </Box>

        {/* Right: Details Panel */}
        <Box
          w={{ base: "100%", md: "280px" }}
          flexShrink={0}
          display={{ base: "none", lg: "block" }}
          h={{ md: "100%" }}
        >
          <DetailsPanel />
        </Box>
      </Box>

      {/* Mobile: Bottom bar with details toggle */}
      <Box
        display={{ base: "flex", lg: "none" }}
        h="48px"
        minH="48px"
        mx={4}
        px={3}
        alignItems="center"
        justifyContent="space-between"
        bg="bg.panel"
        border="1px solid"
        borderColor="gray.subtle"
        borderRadius="lg"
        cursor="pointer"
        onClick={() => setShowMobileDetails(true)}
      >
        <Text fontSize="xs" color="fg.muted">
          {selectedToken !== null
            ? `Token: Position ${selectedToken}`
            : selectedLayer !== null
              ? `Layer: ${selectedLayer === -1 ? "Embed" : selectedLayer === numLayers ? "Final" : `L${selectedLayer}`}`
              : "Tap to view details"}
        </Text>
        <Text fontSize="xs" color="accent">
          Details
        </Text>
      </Box>

      {/* Mobile: Slide-up details drawer */}
      <Drawer.Root
        open={showMobileDetails}
        onOpenChange={(e) => setShowMobileDetails(e.open)}
        placement="bottom"
      >
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content maxH="60vh" borderTopRadius="xl">
            <Drawer.Header borderBottom="1px solid" borderColor="gray.subtle">
              <Drawer.Title>Details</Drawer.Title>
              <Drawer.CloseTrigger />
            </Drawer.Header>
            <Drawer.Body p={0}>
              <DetailsPanel />
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Drawer.Root>
    </Box>
  );
}

/**
 * TransformerViz - Main page component
 */
export function TransformerViz() {
  return (
    <Page>
      <TransformerProvider>
        <DashboardContent />
      </TransformerProvider>
    </Page>
  );
}
