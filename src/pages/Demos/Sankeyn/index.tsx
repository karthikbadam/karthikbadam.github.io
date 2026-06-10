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
  initializeSankeynAtom,
  legendCategoriesAtom,
  loadedSourceAtom,
  loadingStateAtom,
} from "./atoms";
import { DepthControl } from "./DepthControl";
import { OUTCOME_PALETTE_KEY } from "./outcomeColors";
import { SankeynSankey } from "./SankeynSankey";
import { SourceToggle } from "./SourceToggle";

function Chip({ token, label }: { token: string; label: string }) {
  return (
    <HStack gap={1.5}>
      <Box w="9px" h="9px" borderRadius="sm" bg={token} />
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
      <Box w="1px" h="12px" bg="gray.subtle" />
      {OUTCOME_ORDER.map((o) => (
        <Chip key={o} token={`chart.${OUTCOME_PALETTE_KEY[o]}`} label={o} />
      ))}
    </HStack>
  );
}

function Content() {
  useAtomValue(initializeSankeynAtom);
  const state = useAtomValue(loadingStateAtom);
  const loadedSource = useAtomValue(loadedSourceAtom);

  if (state.status !== "ready") {
    return <LoadingIndicator state={state} title="Loading San(key)ⁿ" />;
  }

  return (
    <Flex
      direction="column"
      bg="bg.muted"
      h={{ base: "auto", md: "100%" }}
      overflow={{ base: "visible", md: "hidden" }}
      p={4}
      gap={3}
    >
      {/* Header — title + one-line concept. */}
      <Box>
        <Heading as="h1" size="lg" color="accent" mb={1} lineHeight="1">
          San(key)
          <chakra.sup fontSize="0.5em" top="-0.7em" ml="1px">
            n
          </chakra.sup>
        </Heading>
        <Text fontSize="sm" color="fg.muted" maxW="80ch">
          Each agent run is a chain of tool calls. Slide n to unfold the first n
          calls of every run into one flow.
        </Text>
      </Box>

      {/* Control bar — play, the primary n slider, value, and dataset toggle. */}
      <Flex
        align="center"
        gap={4}
        bg="bg"
        borderWidth="1px"
        borderColor="gray.subtle"
        borderRadius="lg"
        px={4}
        py={3}
      >
        <DepthControl />
        <Box w="1px" h="24px" bg="gray.subtle" flexShrink={0} />
        <SourceToggle />
      </Flex>

      {/* Hero chart — fills the remaining height, full width. */}
      <Box flex="1" minH={0} h={{ base: "460px", md: "auto" }}>
        <TrajectoryPanel
          title="Tool-call flow"
          subtitle="click a layer to expand · click a ribbon to filter"
          right={<Legend />}
        >
          {/* Keyed on the loaded source so the chart re-queries only after the
              table swap has completed. */}
          <SankeynSankey key={loadedSource ?? "init"} />
        </TrajectoryPanel>
      </Box>
    </Flex>
  );
}

export function Sankeyn() {
  return (
    <Page>
      <Provider>
        <Content />
      </Provider>
    </Page>
  );
}
