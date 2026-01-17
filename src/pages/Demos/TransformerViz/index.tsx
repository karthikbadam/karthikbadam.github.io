import { useState } from "react";
import { Box, Container, Heading, Text, Link } from "@chakra-ui/react";
import { Page } from "../../../components/Page";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { TransformerProvider, useTransformer } from "../../../contexts/TransformerContext";
import { ThreeJSTower } from "./ThreeJSTower";
import { StatsPanel } from "./StatsPanel";
import { HoverTooltip } from "./HoverTooltip";

import type { HoverInfo } from "./ThreeJSTower";

/**
 * Main dashboard content
 */
function DashboardContent() {
  const { state, numLayers, numHeads, numKVHeads } = useTransformer();
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

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
            A semantic, weight-driven 3D visualization of{" "}
            <Link
              color="accent"
              href="https://huggingface.co/HuggingFaceTB/SmolLM3-3B"
              target="_blank"
            >
              SmolLM3-3B
            </Link>
            . {numLayers} layers, {numHeads} attention heads per layer with{" "}
            {numHeads / numKVHeads}:1 GQA. ~1M dimension points rendered via point cloud shaders.
          </Text>
        </Box>
      </Container>

      {/* Main layout */}
      <Box
        flex={1}
        px={4}
        overflow={{ base: "auto", md: "hidden" }}
        display="flex"
        flexDirection={{ base: "column", md: "row" }}
        gap={4}
        position="relative"
      >
        {/* Left: Stats Panel */}
        <Box
          w={{ base: "100%", md: "280px" }}
          flexShrink={0}
          h={{ base: "auto", md: "100%" }}
          overflow="auto"
        >
          <StatsPanel />
        </Box>

        {/* Center: 3D Tower */}
        <Box flex={1} minW={0} h={{ base: "70vh", md: "100%" }} position="relative">
          <ThreeJSTower onHover={setHoverInfo} />
          <HoverTooltip info={hoverInfo} position={{ x: 10, y: 40 }} />
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
