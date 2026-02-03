import {
  Box,
  Container,
  Heading,
  HStack,
  NativeSelect,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useMemo } from "react";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { Page } from "../../../components/Page";
import {
  TransformerProvider,
  useTransformer,
} from "../../../contexts/TransformerContext";
import { Heatmap } from "./components/heatmaps";
import { LayerDetailsPanel } from "./components/LayerDetailsPanel";
import { LayerStrip } from "./components/LayerStrip";
import { TokenDetailsPanel } from "./components/TokenDetailsPanel";
import { TokenList } from "./components/TokenList";
import { getMetricInfo, METRIC_CATALOG } from "./config/metrics";

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
    promptTokens,
    highlightedToken,
    highlightedLayer,
  } = useTransformer();

  const showTokenDetails = highlightedToken !== null;
  const showLayerDetails = highlightedLayer !== null;

  const metricInfo = getMetricInfo(selectedMetric);

  // Extract response text
  const responseText = useMemo(() => {
    const generatedTokens = promptTokens.filter((t) => !t.is_input);
    return generatedTokens.map((t) => t.token_text).join("");
  }, [promptTokens]);

  if (state.status !== "ready") {
    return (
      <LoadingIndicator
        state={state}
        title="Loading Transformer Architecture"
      />
    );
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
      <Container maxW="120ch" px={4} py={4}>
        <VStack align="stretch" gap={0} mx="auto">
          {/* Row 1: Title + Prompt/Response */}
          <HStack align="center" columnGap={8} flexWrap="wrap">
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
              <VStack gap={0} align="stretch" flex={1} maxW="100%">
                <HStack gap={2} align="center">
                  <Text fontSize="xs" color="fg.muted" flexShrink={0} w="60px">
                    Prompt:
                  </Text>
                  <NativeSelect.Root size="xs" variant="outline">
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
                  <HStack gap={2}>
                    <Text
                      fontSize="xs"
                      color="fg.muted"
                      flexShrink={0}
                      w="60px"
                    >
                      Response:
                    </Text>
                    <Text fontSize="xs" color="fg" truncate pl={2}>
                      {responseText}
                    </Text>
                  </HStack>
                )}
              </VStack>
            )}
          </HStack>

          {/* Row 2: Metric dropdown + Details */}
          <HStack
            columnGap={2}
            rowGap={0}
            align="center"
            fontSize="xs"
            flexWrap="wrap"
          >
            <HStack gap={1}>
              <Text color="fg.muted" flexShrink={0} w="60px">
                Metric:
              </Text>
              <NativeSelect.Root size="xs" variant="outline" w="200px" pl={1}>
                <NativeSelect.Field
                  value={selectedMetric}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setSelectedMetric(e.target.value)
                  }
                >
                  <optgroup label="Attention">
                    {METRIC_CATALOG.attention.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Contribution">
                    {METRIC_CATALOG.contribution.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Hidden State">
                    {METRIC_CATALOG.hidden.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="MLP Metrics">
                    {METRIC_CATALOG.mlp.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="MLP Neurons">
                    {METRIC_CATALOG.mlpNeurons.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Hidden Trajectory">
                    {METRIC_CATALOG.hiddenTrajectory.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Layer Norm">
                    {METRIC_CATALOG.layernorm.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </HStack>
            {metricInfo && (
              <>
                <Text color="fg">{metricInfo.description}</Text>
                <Text color="fg.muted">{metricInfo.interpretation}</Text>
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
        <Box
          flex={1}
          minW={0}
          display="flex"
          flexDirection="column"
          h={{ base: "60vh", md: "100%" }}
        >
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
          w={{ base: "100%", md: "300px" }}
          flexShrink={0}
          display={{ base: "none", md: "block" }}
          h={{ base: "60vh", md: "100%" }}
        >
          {showTokenDetails && (
            <Box mb={2}>
              <TokenDetailsPanel position={highlightedToken} />
            </Box>
          )}

          {showLayerDetails && (
            <Box>
              <LayerDetailsPanel layer={highlightedLayer} />
            </Box>
          )}
        </Box>
      </Box>
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
