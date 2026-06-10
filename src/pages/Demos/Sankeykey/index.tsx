import { Box, Container, Heading, HStack, Text } from "@chakra-ui/react";
import { Provider, useAtomValue } from "jotai";
import { Page } from "../../../components/Page";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
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

function Chip({ token, label }: { token: string; label: string }) {
  return (
    <HStack gap={1.5}>
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
    return <LoadingIndicator state={state} title="Loading Sankeykey" />;
  }

  return (
    <Container maxW="100ch" py={4}>
      <Box mb={4}>
        <Heading color="accent" mb={1}>
          Sankeykey
        </Heading>
        <Text fontSize="sm" color="fg.muted">
          Agent rollouts — i-th tool call → outcome. Slide to expand how deep
          into each rollout the sankey looks.
        </Text>
      </Box>
      <DepthControl />
      <Box
        mt={3}
        h={{ base: "420px", md: "60vh" }}
        minH="380px"
        p={2}
        borderWidth="1px"
        borderColor="gray.subtle"
        borderRadius="lg"
        bg="bg"
      >
        {/* Keyed on the loaded source so the chart re-queries only after the
            table swap has completed. */}
        <SankeykeySankey key={loadedSource ?? "init"} />
      </Box>
      <Box mt={2} px={1}>
        <Legend />
      </Box>
    </Container>
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
