import { Box, Container, Grid, GridItem, Heading, Text, Link } from "@chakra-ui/react";
import { Page } from "../../../components/Page";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { TransformerProvider, useTransformer } from "../../../contexts/TransformerContext";
import { ArchitectureGraph } from "./ArchitectureGraph";
import { DetailStack } from "./DetailStack";

/**
 * Main dashboard content
 */
function DashboardContent() {
  const { state, numLayers, numHeads, numKVHeads, promptTokens } = useTransformer();

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
      {/* Header */}
      <Container maxW="90ch" px={4} py={4}>
        <Box mb={2}>
          <Heading as="h1" size="lg" color="accent" mb={1}>
            Transformer Architecture Visualization
          </Heading>
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
            {numHeads / numKVHeads}:1 GQA. Live activations from prompt:{" "}
            {promptTokens.filter(t => t.is_input).map(t => t.token_text).join(" ")}
          </Text>
        </Box>
      </Container>

      {/* Two-panel layout */}
      <Grid
        templateColumns={{ base: "1fr", lg: "1fr 2fr" }}
        templateRows={{ base: "auto 1fr", lg: "1fr" }}
        gap={4}
        flex={1}
        px={4}
        overflow="hidden"
      >
        {/* Left: Architecture Graph */}
        <GridItem overflow="hidden">
          <ArchitectureGraph />
        </GridItem>

        {/* Right: Detail Stack */}
        <GridItem overflow="hidden">
          <DetailStack />
        </GridItem>
      </Grid>
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
