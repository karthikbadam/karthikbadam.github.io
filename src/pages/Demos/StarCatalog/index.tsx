import {
  Badge,
  Box,
  Container,
  Heading,
  HStack,
  Link,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Page } from "../../../components/Page";
import { GaiaProvider, useGaia } from "../../../contexts/GaiaContext";
import { SkyMap } from "./SkyMap";
import { HistogramCharts } from "./HistogramCharts";
import { ThreeDView } from "./ThreeDView";

/**
 * Loading state indicator component
 */
function LoadingIndicator() {
  const { state } = useGaia();

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

  // Extract query from state if available
  const currentQuery =
    (state.status === "creating-tables" ||
      state.status === "updating-tables") &&
    "query" in state
      ? (state as { query?: string }).query
      : null;

  return (
    <Box p={6} borderRadius="lg" maxW="600px" mx="auto" mt={10}>
      <Text fontSize="lg" fontWeight="bold" mb={4}>
        Loading Star Catalog
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

/**
 * Main content
 */
function DashboardContent() {
  const { state } = useGaia();

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
