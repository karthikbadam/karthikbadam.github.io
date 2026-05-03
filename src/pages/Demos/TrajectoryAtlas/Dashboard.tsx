import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { TrajectoryStatsPanel } from "./TrajectoryStatsPanel";
import { StepIcicle } from "./StepIcicle";
import { OutcomeSankey } from "./OutcomeSankey";
import { TrajectoryTable } from "./TrajectoryTable";
import { DetailPanel } from "./DetailPanel";
import { TrajectoryPanel } from "./TrajectoryPanel";
import { SankeyDepthSlider } from "./SankeyDepthSlider";
import "./trajectory-atlas.css";

export function Dashboard() {
  const { state, selectedTrajectory, setRowSelection } = useTrajectoryAtlas();

  if (state.status !== "ready") {
    return <LoadingIndicator state={state} title="Loading agent trajectories" />;
  }

  return (
    <Flex direction="column" h={{ base: "auto", md: "100%" }} bg="bg.muted" overflow="hidden">
      <Box px={4} pt={3} pb={2}>
        <Box mb={2}>
          <Heading as="h1" size="md" color="accent" fontWeight="semibold" lineHeight="1.2">
            Visualizing Agent Trajectories
          </Heading>
          <Text
            fontSize="sm"
            color="gray.fg"
            mt={1}
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
          >
            Each step is one message — a user task, tool call, observation, or assistant thought. Click any node or row to cross-filter.
          </Text>
        </Box>
        <TrajectoryStatsPanel />
      </Box>

      <Flex
        direction={{ base: "column", md: "row" }}
        flex={2}
        minH={0}
        gap={2}
        px={4}
        overflow="hidden"
      >
        <Box flex={1} minW={0} minH={0}>
          <TrajectoryPanel
            title="Step Icicle"
            subtitle="step depth (rows) · width = share of trajectories taking this path"
          >
            <StepIcicle />
          </TrajectoryPanel>
        </Box>
        <Box flex={1} minW={0} minH={0}>
          <TrajectoryPanel
            title="Outcome Sankey"
            subtitle="i-th tool call → outcome · click a ribbon · top 10 per column"
            right={<SankeyDepthSlider />}
          >
            <OutcomeSankey />
          </TrajectoryPanel>
        </Box>
      </Flex>

      <Box flex={1.4} minH={0} px={4} pb={2} pt={2} overflow="hidden">
        <TrajectoryPanel
          title="Trajectories"
          subtitle="sort any column, click to inspect"
        >
          <TrajectoryTable />
        </TrajectoryPanel>
      </Box>

      {selectedTrajectory && (
        <DetailPanel traj={selectedTrajectory} onClose={() => setRowSelection(null)} />
      )}
    </Flex>
  );
}
