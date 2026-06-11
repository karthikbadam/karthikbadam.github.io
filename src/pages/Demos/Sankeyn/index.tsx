import { Box, chakra, Flex, Heading, HStack, Text } from "@chakra-ui/react";
import { Provider, useAtomValue } from "jotai";
import { Page } from "../../../components/Page";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { TrajectoryPanel } from "../TrajectoryAtlas/TrajectoryPanel";
import {
  CATEGORY_LABELS,
  OUTCOME_ORDER,
  categoryToken,
  outcomeToken,
} from "../../../components/taxonomy";
import {
  SOURCES,
  initializeSankeynAtom,
  legendCategoriesAtom,
  loadedSourceAtom,
  loadingStateAtom,
} from "./atoms";
import { DepthControl } from "./DepthControl";
import { SankeynSankey } from "./SankeynSankey";
import { SourceToggle } from "./SourceToggle";

function Chip({ token, label }: { token: string; label: string }) {
  return (
    <HStack gap={1}>
      <Box w="8px" h="8px" borderRadius="sm" bg={token} />
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
        <Chip key={o} token={outcomeToken(o)} label={o} />
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
      <Box maxW="100em" mx='auto'>
        <Heading as="h1" size="lg" lineHeight="1.2">
          <Text as="span" color="accent">
            San(key)
            <chakra.sup fontSize="0.5em" top="-0.7em" ml="1px">
              n
            </chakra.sup>
          </Text>
          {loadedSource && (
            <Text as="span" color="fg.muted" fontWeight="normal" fontSize="md" ml={2}>
              · {SOURCES[loadedSource].label} ({SOURCES[loadedSource].runs})
            </Text>
          )}
        </Heading>
        <Text fontSize="sm" color="fg.muted" mt={1}>
          A custom visualization for recursive flows: the sankey unfolds the
          first n tool calls of every agent run, and clicking a layer expands
          it in place.
        </Text>
      </Box>

      <Flex maxW="100em" mx="auto" w="100%" gap={3} align="stretch" wrap="wrap">
        <SourceToggle />
        <Flex
          align="center"
          flex="1"
          minW="480px"
          bg="bg"
          borderWidth="1px"
          borderColor="gray.subtle"
          borderRadius="lg"
          px={4}
          py={2}
        >
          <DepthControl />
        </Flex>
      </Flex>

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
