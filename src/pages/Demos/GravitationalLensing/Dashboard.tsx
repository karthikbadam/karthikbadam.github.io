import { Box, Container, Heading, Text } from "@chakra-ui/react";
import { Page } from "../../../components/Page";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import {
  GravitationalLensingProvider,
  useGravitationalLensing,
} from "../../../contexts/GravitationalLensingContext";
import { LensEditor } from "./LensEditor";
import { LensedGrid } from "./LensedGrid";

/**
 * Main dashboard content
 */
function DashboardContent() {
  const { state } = useGravitationalLensing();

  if (state.status !== "ready") {
    return <LoadingIndicator state={state} title="Loading Gravitational Lenses" />;
  }

  return (
    <Box
      h={{ base: "auto", md: "100%" }}
      overflow="hidden"
      display="flex"
      flexDirection="column"
      bg="bg.muted"
      p={2}
    >
      {/* Header */}
      <Container maxW="85ch" py={4} mx="auto">
        <Box mb={2}>
          <Heading as="h1" size="lg" color="accent" mb={1}>
            Gravitational Lensing Simulation
          </Heading>
          <Text fontSize="sm" color="gray.fg">
            Interactive visualization of gravitational lensing using the
            thin-lens point-mass approximation. Edit lens positions and observe
            the warped grid.
          </Text>
        </Box>
      </Container>

      <Box
        flex={1}
        px={4}
        overflow={{ base: "auto", md: "hidden" }}
        display="flex"
        flexDirection={{ base: "column", md: "row" }}
        gap={4}
      >
        <Box flex={1} minW={0} display="flex" flexDirection="column" gap={4}>
          <Box aspectRatio={{ md: "4/3" }}>
            <LensEditor />
          </Box>
        </Box>
        <Box
          flex={2}
          minW={0}
          h={{ base: "85vh", md: "auto" }}
          borderRadius="md"
          overflow="hidden"
        >
          <LensedGrid />
        </Box>
      </Box>
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
