import { Box, Container, Heading, Text } from "@chakra-ui/react";
import { Provider, useAtomValue } from "jotai";
import { Page } from "../../../components/Page";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import {
  initializeSankeykeyAtom,
  loadedSourceAtom,
  loadingStateAtom,
} from "./atoms";
import { DepthControl } from "./DepthControl";
import { Legend } from "./Legend";
import { SankeykeySankey } from "./SankeykeySankey";

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
