import { Box, Container, Grid, GridItem, Heading, Text, Link, NativeSelect } from "@chakra-ui/react";
import { Page } from "../../../components/Page";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { TransformerProvider, useTransformer } from "../../../contexts/TransformerContext";
import { TokenStrip } from "./components/TokenStrip";
import { MainHeatmap } from "./components/MainHeatmap";
import { LayerNavigator } from "./components/LayerNavigator";
import { FacetControls } from "./components/FacetControls";
import { ModuleInspector } from "./components/ModuleInspector";
import { OverviewPanel } from "./components/OverviewPanel";

/**
 * Main dashboard content
 */
function DashboardContent() {
  const {
    state,
    numLayers,
    numHeads,
    numKVHeads,
    availablePrompts,
    selectedPromptId,
    setSelectedPromptId,
  } = useTransformer();

  if (state.status !== "ready") {
    return <LoadingIndicator state={state} title="Loading Transformer Architecture" />;
  }

  return (
    <Box
      h={{ base: "auto", md: "100vh" }}
      overflow="hidden"
      display="flex"
      flexDirection="column"
      bg="bg.muted"
    >
      {/* Header */}
      <Box px={4} py={3} borderBottom="1px solid" borderColor="border" bg="bg.surface">
        <Container maxW="full" px={0}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Heading as="h1" size="lg" color="accent" mb={0}>
              Transformer Architecture Visualization
            </Heading>
            {availablePrompts.length > 0 && (
              <NativeSelect.Root maxW="400px" size="sm">
                <NativeSelect.Field
                  value={selectedPromptId ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedPromptId(Number(e.target.value))}
                >
                  {availablePrompts.map((prompt) => (
                    <option key={prompt.prompt_id} value={prompt.prompt_id}>
                      Prompt {prompt.prompt_id}: {prompt.prompt_text.substring(0, 50)}
                      {prompt.prompt_text.length > 50 ? "..." : ""}
                    </option>
                  ))}
                </NativeSelect.Field>
              </NativeSelect.Root>
            )}
          </Box>
          <Text fontSize="sm" color="gray.fg">
            Interactive visualization of{" "}
            <Link
              color="accent"
              href="https://huggingface.co/HuggingFaceTB/SmolLM3-3B"
              target="_blank"
            >
              SmolLM3-3B
            </Link>
            . {numLayers} layers, {numHeads} attention heads per layer with{" "}
            {numHeads / numKVHeads}:1 GQA.
          </Text>
        </Container>
      </Box>

      {/* Token Strip */}
      <TokenStrip />

      {/* Three-panel layout */}
      <Grid
        templateColumns="200px 1fr 350px"
        templateRows="1fr"
        gap={4}
        flex={1}
        px={4}
        py={4}
        overflow="hidden"
        minH={0}
      >
        {/* Left: Layer Navigator */}
        <GridItem overflow="hidden" minH={0}>
          <LayerNavigator />
        </GridItem>

        {/* Center: Main Heatmap */}
        <GridItem overflow="hidden" minH={0}>
          <MainHeatmap />
        </GridItem>

        {/* Right: FacetControls + ModuleInspector */}
        <GridItem overflow="hidden" minH={0} display="flex" flexDirection="column">
          <Box
            position="sticky"
            top={0}
            zIndex={10}
            bg="bg.surface"
            borderBottom="1px solid"
            borderColor="border"
          >
            <FacetControls />
          </Box>
          <Box
            flex={1}
            overflowY="auto"
            maxH="calc(100vh - 200px)"
            mt={2}
          >
            <ModuleInspector />
          </Box>
        </GridItem>
      </Grid>

      {/* Overview Panel (persistent footer) */}
      <Box px={4} py={2} borderTop="1px solid" borderColor="border" bg="bg.surface">
        <OverviewPanel />
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
