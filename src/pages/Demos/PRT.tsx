import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Link,
  List,
  Stack,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { PackedRadialTree, TreeNode } from "@kvis/packed-radial-tree";
import { useState } from "react";
import { LuExternalLink } from "react-icons/lu";
import { Page } from "../../components/Page";
import { TwoPanelWithScroll } from "../../components/TwoPanelWithScroll";
import { useColorMode } from "../../components/ui/color-mode";
import { useUATData } from "../../hooks/useUATData";
import {
  getDescendants,
  getTopLevelNodes,
  googleSearch,
  PRT_CONFIG,
} from "../../utils/prtUtils";

import { useCallback, useMemo } from "react";

const HeaderSection = () => (
  <Box>
    <Heading as="h1" size="2xl" color="accent" mb={2}>
      Explore Astronomy Concepts with a <br /> Packed Radial Tree
    </Heading>
    <Text fontSize="sm" color="gray.focusRing" mb={4}>
      Custom-designed visualization by Karthik Badam, May 26, 2025.
    </Text>
    <Text fontSize="sm" color="gray.fg">
      Explore and learn astronomy concepts from the Unified Astronomy Thesaurus
      (UAT) using this visualization. Each circle is a concept in the thesaurus.
      Pick a circle to reveal the concepts within the broader area. Double click
      to see the hierarchy under a specific concept.
    </Text>
  </Box>
);

interface NodeDetailsProps {
  selectedNode: TreeNode;
  descendants: TreeNode[];
}

const NodeDetails = ({ selectedNode, descendants }: NodeDetailsProps) => (
  <Box>
    <Heading as="h2" size="md" mb={1} color="accentSubtle">
      Selected Concept
    </Heading>
    <VStack gap={4} align="stretch">
      <HStack wrap="wrap" gap={8}>
        <Box>
          <Text
            fontSize="xs"
            fontWeight="semibold"
            mb={1}
            color="gray.focusRing"
          >
            NAME
          </Text>
          <Link
            href={selectedNode.label && googleSearch(selectedNode.label)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Text fontSize="sm" mr={1}>
              {selectedNode.label}{" "}
            </Text>
            <LuExternalLink />
          </Link>
        </Box>
        {selectedNode.metrics?.depth && (
          <Box>
            <Text
              fontSize="xs"
              fontWeight="semibold"
              mb={1}
              color="gray.focusRing"
            >
              DEPTH
            </Text>
            <Badge colorScheme="blue" size="sm">
              {selectedNode.metrics.depth}
            </Badge>
          </Box>
        )}
        <Box>
          <Text
            fontSize="xs"
            fontWeight="semibold"
            mb={1}
            color="gray.focusRing"
          >
            CHILDREN
          </Text>
          <Badge colorScheme="green" size="sm">
            {selectedNode.children?.length || 0}
          </Badge>
        </Box>
      </HStack>

      {descendants.length > 0 && (
        <Box>
          <Text
            fontSize="xs"
            fontWeight="semibold"
            mb={2}
            color="gray.focusRing"
          >
            DESCENDANT CONCEPTS ({descendants.length})
          </Text>
          <Wrap>
            {descendants.map((desc) => (
              <WrapItem key={desc.id}>
                <Link
                  href={desc.label && googleSearch(desc.label)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="outline">
                    {desc.label}
                    <LuExternalLink />
                  </Button>
                </Link>
              </WrapItem>
            ))}
          </Wrap>
        </Box>
      )}
    </VStack>
  </Box>
);

interface TopLevelConceptsProps {
  topLevelNodes: TreeNode[];
}

const TopLevelConcepts = ({ topLevelNodes }: TopLevelConceptsProps) => (
  <Box>
    <Heading as="h2" size="md" mb={1} color="accentSubtle">
      Top-level Concepts
    </Heading>
    <Wrap gap={2}>
      {topLevelNodes.map((node) => (
        <WrapItem key={node.id}>
          <Link
            href={node.label && googleSearch(node.label)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="outline">
              {node.label}
              <LuExternalLink />
            </Button>
          </Link>
        </WrapItem>
      ))}
    </Wrap>
  </Box>
);

const InteractionGuide = () => (
  <Box>
    <Heading as="h2" size="md" mb={1} color="accentSubtle">
      Interaction Guide
    </Heading>
    <List.Root fontSize="sm" ml={4} gap={1}>
      <List.Item>
        <Text as="span" fontWeight="semibold">
          Click
        </Text>{" "}
        any node to select. Click again to unselect.
      </List.Item>
      <List.Item>
        <Text as="span" fontWeight="semibold">
          Double-Click
        </Text>{" "}
        any node to zoom into the sub-hierarchy. Use the navigation buttons on
        top left to return to root.
      </List.Item>
      <List.Item>
        <Text as="span" fontWeight="semibold">
          Hover
        </Text>{" "}
        for detailed tooltips.
      </List.Item>
      <List.Item>
        <Text as="span" fontWeight="semibold">
          Zoom
        </Text>{" "}
        with mouse wheel or trackpad.
      </List.Item>
      <List.Item>
        <Text as="span" fontWeight="semibold">
          Pan
        </Text>{" "}
        by dragging the background.
      </List.Item>
    </List.Root>
  </Box>
);

const DatasetDescription = () => (
  <Box>
    <Heading as="h2" size="md" mb={2} color="accentSubtle">
      About the Dataset
    </Heading>
    <Text fontSize="sm" color="gray.fg">
      Unified Astronomy Thesaurus (UAT) is a controlled vocabulary of
      astronomical terms developed by the American Astronomical Society. This
      graph visualizes that hierarchy so you can study how thousands of concepts
      relate across 11 levels of depth, from broad processes to specific
      phenomena.
    </Text>
  </Box>
);

const VisualizationExplanation = () => (
  <Box>
    <Heading as="h3" size="md" mb={2} color="accentSubtle">
      How It Works
    </Heading>
    <VStack gap={1} align="stretch">
      <Text fontSize="sm" color="gray.fg">
        <strong>Circle Size:</strong> Represents the number of descendant
        concepts
      </Text>
      <Text fontSize="sm" color="gray.fg">
        <strong>Radial Layout:</strong> Parent-child relationships shown through
        positioning
      </Text>
      <Text fontSize="sm" color="gray.fg">
        <strong>Color Encoding:</strong> Visual distinction between concept
        categories
      </Text>
    </VStack>
  </Box>
);

const LoadingState = () => (
  <Page>
    <Box minH="50vh" display="flex" alignItems="center" justifyContent="center">
      <VStack gap={4}>
        <Heading color="accent">Loading UAT Dataset...</Heading>
        <Text color="gray.fg">
          Parsing hierarchical astronomy taxonomy data
        </Text>
      </VStack>
    </Box>
  </Page>
);

interface ErrorStateProps {
  error: string;
}

const ErrorState = ({ error }: ErrorStateProps) => (
  <Page>
    <Box minH="50vh" display="flex" alignItems="center" justifyContent="center">
      <VStack gap={4}>
        <Heading color="red.500">Error Loading Data</Heading>
        <Text color="gray.fg">{error}</Text>
      </VStack>
    </Box>
  </Page>
);

export function PackedRadialTreeDemo() {
  const [selectedNode, setSelectedNode] = useState<TreeNode | undefined>(
    undefined
  );
  const { data: uatData, loading, error } = useUATData();
  const { colorMode } = useColorMode();

  const config = useMemo(
    () => ({
      ...PRT_CONFIG,
      colorMode,
    }),
    [colorMode]
  );

  const handleNodeSelect = useCallback((node: TreeNode | undefined) => {
    setSelectedNode((current) => {
      if (current?.id === node?.id) {
        return undefined;
      } else {
        return node;
      }
    });
  }, []);

  const descendants = useMemo(
    () => (selectedNode ? getDescendants(selectedNode) : []),
    [selectedNode]
  );

  const topLevelNodes = useMemo(() => getTopLevelNodes(uatData), [uatData]);

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  return (
    <Page>
      <TwoPanelWithScroll
        leftWidth="2fr"
        rightWidth="1fr"
        px={8}
        gap={6}
        maxW="100em"
      >
        {/* Visualization Panel */}
        <TwoPanelWithScroll.LeftPanel
          h={{ base: "68vh", md: "calc(100vh - 200px)" }}
        >
          {uatData && (
            <PackedRadialTree
              data={uatData}
              onNodeSelect={handleNodeSelect}
              options={config}
            />
          )}
        </TwoPanelWithScroll.LeftPanel>

        {/* Content Panel */}
        <TwoPanelWithScroll.RightPanel py={2}>
          <Stack gap={6} maxW="72ch">
            <HeaderSection />
            {selectedNode ? (
              <NodeDetails
                selectedNode={selectedNode}
                descendants={descendants}
              />
            ) : (
              <TopLevelConcepts topLevelNodes={topLevelNodes} />
            )}

            <InteractionGuide />
            <DatasetDescription />
            <VisualizationExplanation />
          </Stack>
        </TwoPanelWithScroll.RightPanel>
      </TwoPanelWithScroll>
    </Page>
  );
}
