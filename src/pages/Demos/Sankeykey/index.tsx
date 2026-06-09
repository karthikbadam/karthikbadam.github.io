import { Box, Container, Heading, Text } from "@chakra-ui/react";
import { Provider, useAtomValue } from "jotai";
import { Page } from "../../../components/Page";
import { LoadingIndicator } from "../../../components/LoadingIndicator";
import { initializeSankeykeyAtom, loadingStateAtom } from "./atoms";
import { DepthControl } from "./DepthControl";
import { DesignNotes } from "./DesignNotes";
import { SankeykeySankey } from "./SankeykeySankey";

function Content() {
  useAtomValue(initializeSankeykeyAtom);
  const state = useAtomValue(loadingStateAtom);

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
          DeepSWE · Kimi-K2 rollouts — i-th tool call → outcome. Slide to
          expand how deep into each rollout the sankey looks.
        </Text>
      </Box>
      <DepthControl />
      <Box
        mt={3}
        h={{ base: "420px", md: "55vh" }}
        minH="380px"
        p={2}
        borderWidth="1px"
        borderColor="gray.subtle"
        borderRadius="lg"
        bg="bg"
      >
        <SankeykeySankey />
      </Box>
      <DesignNotes />
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
