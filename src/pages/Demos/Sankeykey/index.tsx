import { Box, chakra, Flex, Heading, HStack, Text } from "@chakra-ui/react";
import { Provider, useAtomValue } from "jotai";
import { Page } from "../../../components/Page";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { TrajectoryPanel } from "../TrajectoryAtlas/TrajectoryPanel";
import {
  CATEGORY_LABELS,
  OUTCOME_ORDER,
  categoryToken,
} from "../../../components/taxonomy";
import {
  initializeSankeykeyAtom,
  legendCategoriesAtom,
  loadedSourceAtom,
  loadingStateAtom,
} from "./atoms";
import { DepthControl } from "./DepthControl";
import { OUTCOME_PALETTE_KEY } from "./outcomeColors";
import { SankeykeySankey } from "./SankeykeySankey";
import { SourceToggle } from "./SourceToggle";

function Chip({ token, label }: { token: string; label: string }) {
  return (
    <HStack gap={2}>
      <Box w="10px" h="10px" borderRadius="sm" bg={token} />
      <Text>{label}</Text>
    </HStack>
  );
}

function Legend() {
  const categories = useAtomValue(legendCategoriesAtom);

  return (
    <HStack flexWrap="wrap" gap={3} fontSize="xs" color="fg.muted">
      {categories.map((cat) => (
        <Chip key={cat} token={categoryToken(cat)} label={CATEGORY_LABELS[cat]} />
      ))}
      <Box w="1px" alignSelf="stretch" bg="gray.subtle" />
      {OUTCOME_ORDER.map((o) => (
        <Chip key={o} token={`chart.${OUTCOME_PALETTE_KEY[o]}`} label={o} />
      ))}
    </HStack>
  );
}

function Content() {
  useAtomValue(initializeSankeykeyAtom);
  const state = useAtomValue(loadingStateAtom);
  const loadedSource = useAtomValue(loadedSourceAtom);

  if (state.status !== "ready") {
    return <LoadingIndicator state={state} title="Loading San(key)ⁿ" />;
  }

  return (
    <Flex direction="column" bg="bg.muted" minH="100%">
      {/* Compact header — title + description stay at a readable width. */}
      <Box px={4} pt={4} pb={2} maxW="80em" mx="auto" w="100%">
        <Flex justify="space-between" align="flex-start" gap={4} wrap="wrap">
          <Box>
            <Heading as="h1" size="lg" color="accent" mb={1}>
              San(key)
              <chakra.sup fontSize="0.55em" top="-0.6em">
                n
              </chakra.sup>
            </Heading>
            <Text fontSize="sm" color="fg.muted" maxW="60ch">
              AI agents solve tasks by calling tools step by step. Each path is
              one agent run; raise n to reveal the first n tool calls across
              every run.
            </Text>
          </Box>
          <SourceToggle />
        </Flex>
      </Box>

      {/* Chart panel — takes the full width. */}
      <Box px={4} pb={2} w="100%">
        <Box h={{ base: "440px", md: "64vh" }} minH="400px">
          <TrajectoryPanel
            title="San(key)ⁿ"
            subtitle="each path is one agent run · click a layer to expand · click a ribbon to filter"
            right={<DepthControl />}
          >
            {/* Keyed on the loaded source so the chart re-queries only after
                the table swap has completed. */}
            <SankeykeySankey key={loadedSource ?? "init"} />
          </TrajectoryPanel>
        </Box>
        <Box mt={2} px={1}>
          <Legend />
        </Box>
      </Box>
    </Flex>
  );
}

export function Sankeykey() {
  return (
    <Page>
      <Provider>
        <Content />
      </Provider>
    </Page>
  );
}
