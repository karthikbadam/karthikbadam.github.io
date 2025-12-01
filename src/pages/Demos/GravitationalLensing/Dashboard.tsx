import {
  Badge,
  Box,
  Container,
  Grid,
  GridItem,
  Heading,
  HStack,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Page } from "../../../components/Page";
import {
  GravitationalLensingProvider,
  useGravitationalLensing,
} from "../../../contexts/GravitationalLensingContext";
import { LensEditor } from "./LensEditor";
import { LensedGrid } from "./LensedGrid";

/**
 * Loading state indicator component
 */
function LoadingIndicator() {
  const { state } = useGravitationalLensing();

  if (state.status === "ready") return null;

  const steps = [
    { key: "initializing", label: "Initializing DuckDB" },
    { key: "creating-tables", label: "Creating tables" },
    { key: "computing-lensing", label: "Computing lensing" },
    { key: "ready", label: "Ready" },
  ];

  const currentIndex = steps.findIndex(
    (s) => s.key === state.status.split("-")[0] || s.key === state.status
  );

  // Extract query from state if available
  const currentQuery =
    (state.status === "creating-tables" || state.status === "computing-lensing") &&
    "query" in state
      ? (state as { query?: string }).query
      : null;

  return (
    <Box p={6} borderRadius="lg" maxW="600px" mx="auto" mt={10}>
      <Text fontSize="lg" fontWeight="bold" mb={4}>
        Loading Gravitational Lensing Demo
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
      {currentQuery && (
        <Box
          mt={4}
          p={3}
          bg="bg.subtle"
          borderRadius="md"
          maxH="450px"
          overflow="auto"
        >
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
  const { state } = useGravitationalLensing();

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
      <Container maxW="85ch" px={4} py={4} mx="auto">
        <Box mb={2}>
          <Heading as="h1" size="lg" color="accent" mb={1}>
            Gravitational Lensing Simulation
          </Heading>
          <Text fontSize="sm" color="gray.fg">
            Interactive visualization of gravitational lensing using the thin-lens
            point-mass approximation. Edit lens positions and observe the warped grid.
          </Text>
        </Box>
      </Container>

      {/* Charts Grid */}
      <Grid
        templateAreas={{
          base: `"editor" "grid"`,
          md: `"editor grid"`,
        }}
        templateColumns={{ base: "1fr", md: "1fr 2fr" }}
        templateRows={{
          base: "1fr 1fr",
          md: "1fr",
        }}
        gap={2}
        flex={1}
        px={4}
        overflow="hidden"
      >
        <GridItem area="editor" overflow="auto">
          <LensEditor />
        </GridItem>

        <GridItem area="grid" overflow="auto">
          <LensedGrid />
        </GridItem>
      </Grid>
    </Box>
  );
}

/**
 * GravitationalLensingDashboard - Main dashboard page component
 */
export function GravitationalLensingDashboard() {
  return (
    <Page>
      <GravitationalLensingProvider>
        <DashboardContent />
      </GravitationalLensingProvider>
    </Page>
  );
}

