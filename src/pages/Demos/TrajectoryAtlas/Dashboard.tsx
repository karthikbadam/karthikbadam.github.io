import {
  Box,
  Container,
  Grid,
  GridItem,
  Heading,
  HStack,
  Text,
} from "@chakra-ui/react";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { TrajectoryStatsPanel } from "./TrajectoryStatsPanel";
import { StepIcicle } from "./StepIcicle";
import { OutcomeSankey } from "./OutcomeSankey";
import { TrajectoryTable } from "./TrajectoryTable";
import { DetailPanel } from "./DetailPanel";
import { TrajectoryPanel } from "./TrajectoryPanel";

export function Dashboard() {
  const { state, selectedTrajectory, setRowSelection } = useTrajectoryAtlas();

  if (state.status !== "ready") {
    return <LoadingIndicator state={state} title="Loading agent trajectories" />;
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
      <Container maxW="85ch" px={4} py={4} mx="auto">
        <Box mb={2}>
          <Heading as="h1" size="lg" color="accent" mb={1}>
            Visualizing Agent Trajectories
          </Heading>
          <HStack gap={2} alignItems="baseline" flexWrap="wrap">
            <Text fontSize="sm" color="gray.fg">
              Step icicle reveals the most-traveled paths; outcome sankey traces
              entry actions through dominant tools to outcomes; the table cross-filters with both.
            </Text>
          </HStack>
        </Box>
        <TrajectoryStatsPanel />
      </Container>

      <Grid
        templateColumns={{ base: "1fr", md: "1fr 1fr" }}
        templateRows={{ base: "auto auto auto", md: "1fr 1fr" }}
        gap={2}
        flex={1}
        px={4}
        overflow="hidden"
      >
        <GridItem overflow="hidden">
          <TrajectoryPanel
            title="Step Icicle"
            subtitle="Step depth (rows) · width = share of trajectories taking this path"
          >
            <StepIcicle />
          </TrajectoryPanel>
        </GridItem>
        <GridItem overflow="hidden">
          <TrajectoryPanel
            title="Outcome Sankey"
            subtitle="Entry action → dominant action → outcome · click a ribbon"
          >
            <OutcomeSankey />
          </TrajectoryPanel>
        </GridItem>

        <GridItem colSpan={{ base: 1, md: 2 }} overflow="hidden">
          <TrajectoryPanel
            title="Trajectories"
            subtitle="sort any column, click to inspect"
          >
            <TrajectoryTable />
          </TrajectoryPanel>
        </GridItem>
      </Grid>

      {selectedTrajectory && (
        <DetailPanel traj={selectedTrajectory} onClose={() => setRowSelection(null)} />
      )}
    </Box>
  );
}
