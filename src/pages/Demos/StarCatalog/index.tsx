import { Box, Container, Heading, Link, Text } from "@chakra-ui/react";
import { Page } from "../../../components/Page";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { GaiaProvider, useGaia } from "../../../contexts/GaiaContext";
import { SkyMap } from "./SkyMap";
import { HistogramCharts } from "./HistogramCharts";
import { ThreeDView } from "./ThreeDView";

/**
 * Main content
 */
function DashboardContent() {
  const { state } = useGaia();

  if (state.status !== "ready") {
    return <LoadingIndicator state={state} title="Loading Star Catalog" />;
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
      <Container maxW="85ch" px={4} py={4}>
        <Box mb={2}>
          <Heading as="h1" size="lg" color="accent" mb={1}>
            Gaia Star Catalog Explorer
          </Heading>
          <Text fontSize="sm" color="gray.fg">
            A small collection of 1 million stars with their positions,
            magnitudes, and other properties. This is a subset of the Gaia star
            catalog that contains 1 billion stars.{" "}
            <Link
              fontSize="sm"
              color="accent"
              href="https://gaia.aip.de/query/b9cbe033-a5bf-401e-ba85-65d6768f2444/"
              target="_blank"
            >
              View the full catalog
            </Link>
          </Text>
        </Box>
      </Container>

      {/* Two-panel layout - responsive */}
      <Box
        flex={1}
        px={4}
        overflow={{ base: "auto", md: "hidden" }}
        display="flex"
        flexDirection={{ base: "column", md: "row" }}
        gap={4}
      >
        {/* Left: Sky Map + Histograms stacked */}
        <Box flex={1} minW={0} display="flex" flexDirection="column" gap={4}>
          <Box aspectRatio={{ md: "4/3" }}>
            <SkyMap />
          </Box>
          <Box flex={{ md: 1 }}>
            <HistogramCharts />
          </Box>
        </Box>

        {/* Right: 3D View */}
        <Box
          flex={2}
          minW={0}
          h={{ base: "85vh", md: "auto" }}
          borderRadius="md"
          overflow="hidden"
        >
          <ThreeDView />
        </Box>
      </Box>
    </Box>
  );
}

/**
 * StarCatalogExplorer - Main page component
 */
export function StarCatalogExplorer() {
  return (
    <Page>
      <GaiaProvider>
        <DashboardContent />
      </GaiaProvider>
    </Page>
  );
}
