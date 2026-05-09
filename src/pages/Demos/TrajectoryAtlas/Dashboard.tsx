import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { useAtom, useAtomValue } from "jotai";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import {
  initializeTrajectoryAtlasAtom,
  loadingStateAtom,
  selectedTrajectoryAtom,
} from "./atoms";
import { DetailPanel } from "./DetailPanel";
import { OutcomeSankey } from "./OutcomeSankey";
import { SankeyDepthSlider } from "./SankeyDepthSlider";
import { StepIcicle } from "./StepIcicle";
import { TrajectoryPanel } from "./TrajectoryPanel";
import { TrajectoryStatsPanel } from "./TrajectoryStatsPanel";
import { TrajectoryTable } from "./TrajectoryTable";

export function Dashboard() {
  useAtomValue(initializeTrajectoryAtlasAtom);
  const state = useAtomValue(loadingStateAtom);
  const [selectedTrajectory, setSelectedTrajectory] = useAtom(
    selectedTrajectoryAtom,
  );

  if (state.status !== "ready") {
    return (
      <LoadingIndicator state={state} title="Loading agent trajectories" />
    );
  }

  return (
    <Flex
      direction="column"
      h={{ base: "auto", md: "100%" }}
      bg="bg.muted"
      overflow={{ base: "visible", md: "hidden" }}
    >
      <Box px={4} pt={4} pb={2} maxW="80em" mx="auto" w="100%">
        <Box mb={2}>
          <Heading as="h1" size="lg" color="accent" mb={1}>
            Trajectory Atlas
          </Heading>
          <Text fontSize="sm" color="fg.muted">
            Understand agent trajectories by steps taken. Each step in the
            graphs is one action: a tool call, user/assistant observation, or
            thought.
          </Text>
        </Box>
        <TrajectoryStatsPanel />
      </Box>

      <Flex
        direction={{ base: "column", md: "row" }}
        flex={{ base: "0 0 auto", md: 2 }}
        minH={0}
        gap={2}
        px={4}
        overflow={{ base: "visible", md: "hidden" }}
      >
        <Box
          flex={{ base: "0 0 auto", md: 1 }}
          minW={0}
          minH={0}
          h={{ base: "350px", md: "auto" }}
        >
          <TrajectoryPanel
            title="Step Icicle"
            subtitle="step depth (rows) · width = share of trajectories · Click a node to filter the path"
          >
            <StepIcicle />
          </TrajectoryPanel>
        </Box>
        <Box
          flex={{ base: "0 0 auto", md: 1 }}
          minW={0}
          minH={0}
          h={{ base: "350px", md: "auto" }}
        >
          <TrajectoryPanel
            title="Outcome Sankey"
            subtitle="i-th tool call → outcome · click a ribbon"
            right={<SankeyDepthSlider />}
          >
            <OutcomeSankey />
          </TrajectoryPanel>
        </Box>
      </Flex>

      <Box
        flex={{ base: "0 0 auto", md: 1.4 }}
        minH={0}
        h={{ base: "450px", md: "auto" }}
        px={4}
        pb={2}
        pt={2}
        overflow={{ base: "visible", md: "hidden" }}
      >
        <TrajectoryPanel
          title="Trajectories"
          subtitle="sort any column, click to inspect"
        >
          <TrajectoryTable />
        </TrajectoryPanel>
      </Box>

      <DetailPanel
        traj={selectedTrajectory}
        onClose={() => setSelectedTrajectory(null)}
      />
    </Flex>
  );
}
