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
      <Flex justify="space-between" align="flex-start" gap={8} wrap="wrap">
        <Box maxW="72ch">
          <Heading as="h1" size="lg" color="accent" mb={1} lineHeight="1">
            San(key)
            <chakra.sup fontSize="0.5em" top="-0.7em" ml="1px">
              n
            </chakra.sup>
          </Heading>
          <Text fontSize="sm" color="fg.muted" mt={1}>
            Each agent run is a chain of tool calls that ends in an outcome.
            Every column stacks one position in that chain, colored by the kind
            of tool used there; ribbons trace how runs flow from tool to tool
            and finally into success, partial, or fail. Slide n to unfold more
            of the chain.
          </Text>
        </Box>
        <SourceToggle />
      </Flex>

      <Flex
        align="center"
        bg="bg"
        borderWidth="1px"
        borderColor="gray.subtle"
        borderRadius="lg"
        px={4}
        py={3}
        alignSelf={{ base: "stretch", md: "flex-start" }}
        w={{ base: "100%", md: "min(72ch, 100%)" }}
      >
        <DepthControl />
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
