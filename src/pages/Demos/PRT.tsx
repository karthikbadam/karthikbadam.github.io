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
import {
  createSampleOntology,
  PackedRadialTree,
  PackedTreeOptions,
  TreeNode,
} from "@kvis/packed-radial-tree";
import { useEffect, useState } from "react";
import { LuExternalLink } from "react-icons/lu";
import { Page } from "../../components/Page";
import { TwoPanelWithScroll } from "../../components/TwoPanelWithScroll";
import { useColorMode } from "../../components/ui/color-mode";

const parseUATData = async (): Promise<TreeNode> => {
  try {
    const response = await fetch("/data/UAT.csv");
    const csvText = await response.text();
    const lines = csvText.split("\n").slice(1);

    const root: TreeNode = {
      id: "root",
      label: "Unified Astronomy Thesaurus",
      children: [],
      value: 1,
      subtreeSize: 1,
    };

    const nodeMap = new Map<string, TreeNode>();
    nodeMap.set("root", root);

    lines.forEach((line) => {
      if (!line.trim()) return;

      const levels = line
        .split(",")
        .map((cell) => cell.trim())
        .filter((cell) => cell);
      if (levels.length === 0) return;

      let currentParent = root;
      let currentPath = "";

      levels.forEach((level, levelIndex) => {
        currentPath = currentPath ? `${currentPath}/${level}` : level;

        if (!nodeMap.has(currentPath)) {
          const newNode: TreeNode = {
            id: currentPath,
            label: level,
            children: [],
            value: 1,
            subtreeSize: 1,
            metrics: {
              depth: levelIndex + 1,
            },
          };

          nodeMap.set(currentPath, newNode);
          currentParent.children = currentParent.children || [];
          currentParent.children.push(newNode);
        }

        currentParent = nodeMap.get(currentPath)!;
      });
    });

    // Calculate values based on number of children
    const calculateValues = (node: TreeNode): number => {
      if (!node.children || node.children.length === 0) {
        node.value = 1;
        node.subtreeSize = 1;
        return 1;
      }

      const childrenValue = node.children.reduce(
        (sum, child) => sum + calculateValues(child),
        0
      );
      node.value = childrenValue;
      node.subtreeSize = childrenValue;
      return childrenValue;
    };

    calculateValues(root);
    return root;
  } catch (error) {
    console.error("Error loading UAT data:", error);
    // Fallback to sample data
    return createSampleOntology();
  }
};

export function PackedRadialTreeDemo() {
  const [selectedNode, setSelectedNode] = useState<TreeNode | undefined>(
    undefined
  );
  const [uatData, setUatData] = useState<TreeNode | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const { colorMode } = useColorMode();

  const config: Partial<PackedTreeOptions> = {
    maxDepth: 2,
    isInterleaved: true,
    isPacked: true,
    isCollisionResolved: true,
    sizeColumn: "subtreeSize",
    showLabels: true,
    showTooltips: true,
    colorMode,
    sizeRange: [3, 60],
  };

  // Load UAT data
  useEffect(() => {
    parseUATData().then((data) => {
      setUatData(data);
      setLoading(false);
    });
  }, []);

  const handleNodeSelect = (node: TreeNode | undefined) => {
    setSelectedNode(node);
  };

  const googleSearch = (term: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(term)}`;

  const getDescendants = (node: TreeNode): TreeNode[] => {
    if (!node.children) return [];

    const descendants: TreeNode[] = [];
    const traverse = (n: TreeNode) => {
      if (n.children) {
        n.children.forEach((child) => {
          descendants.push(child);
          traverse(child);
        });
      }
    };

    traverse(node);
    return descendants.slice(0, 10); // Limit to first 10 for display
  };

  const descendants = selectedNode ? getDescendants(selectedNode) : [];
  const topLevelNodes = uatData?.children ? uatData.children.slice(0, 20) : [];

  if (loading) {
    return (
      <Page>
        <Box
          minH="50vh"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <VStack gap={4}>
            <Heading color="accent">Loading UAT Dataset...</Heading>
            <Text color="gray.fg">
              Parsing hierarchical astronomy taxonomy data
            </Text>
          </VStack>
        </Box>
      </Page>
    );
  }

  return (
    <Page>
      <TwoPanelWithScroll leftWidth="2fr" rightWidth="1fr" px={6} gap={6}>
        {/* Left Column - Visualization (Full Height) */}
        <TwoPanelWithScroll.LeftPanel h="72vh">
          {uatData && (
            <PackedRadialTree
              data={uatData}
              onNodeSelect={handleNodeSelect}
              options={config}
            />
          )}
        </TwoPanelWithScroll.LeftPanel>
        {/* Right Column - Content */}
        <TwoPanelWithScroll.RightPanel>
          <Stack gap={6} maxW="72ch">
            {/* Header */}
            <Box>
              <Heading as="h1" size="2xl" color="accent" mb={2}>
                Explore Astronomy Concepts with a Packed Radial Tree
              </Heading>
              <Text fontSize="sm" color="gray.focusRing" mb={4}>
                Custom-designed visualization by Karthik Badam, May 26, 2025.
              </Text>
              <Text fontSize="sm" color="gray.fg">
                Explore and learn astronomy concepts from the Unified Astronomy
                Thesaurus (UAT) using this visualization. Each circle is a
                concept in the thesaurus. Pick a circle to reveal the concepts
                within the broader area. Double click to see the hierarchy under
                a specific concept.
              </Text>
            </Box>

            {/* Selected Node Details */}
            {selectedNode ? (
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
                      <Text fontSize="sm">
                        {selectedNode.label}{" "}
                        <Link
                          href={
                            selectedNode.label &&
                            googleSearch(selectedNode.label)
                          }
                          color="accent"
                        >
                          (search)
                        </Link>
                      </Text>
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
                    <>
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
                                as={Link}
                                href={desc.label && googleSearch(desc.label)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Button
                                  size="sm"
                                  variant="outline"
                                  colorScheme="blue"
                                >
                                  {desc.label}
                                  <LuExternalLink />
                                </Button>
                              </Link>
                            </WrapItem>
                          ))}
                        </Wrap>
                      </Box>
                    </>
                  )}
                </VStack>
              </Box>
            ) : (
              <Box>
                <Heading as="h2" size="md" mb={1} color="accentSubtle">
                  Top-level Concepts
                </Heading>
                <Wrap gap={2}>
                  {topLevelNodes.map((node) => (
                    <WrapItem key={node.id}>
                      <Link
                        as={Link}
                        href={node.label && googleSearch(node.label)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" variant="outline" colorScheme="blue">
                          {node.label}
                          <LuExternalLink />
                        </Button>
                      </Link>
                    </WrapItem>
                  ))}
                </Wrap>
              </Box>
            )}

            {/* Interaction Guide */}
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
                  any node to zoom into the sub-hierarchy. Use the navigation
                  buttons on top left to return to root.
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

            {/* Dataset Description */}
            <Box>
              <Heading as="h2" size="md" mb={2} color="accentSubtle">
                About the Dataset
              </Heading>
              <Text fontSize="sm" color="gray.fg">
                Unified Astronomy Thesaurus (UAT) is a controlled vocabulary of
                astronomical terms developed by the American Astronomical
                Society. This graph visualizes that hierarchy so you can study
                how thousands of concepts relate across 11 levels of depth, from
                broad processes to specific phenomena.
              </Text>
            </Box>

            {/* Visualization Explanation */}
            <Box>
              <Heading as="h3" size="md" mb={2} color="accentSubtle">
                How It Works
              </Heading>
              <VStack gap={1} align="stretch">
                <Text fontSize="sm" color="gray.fg">
                  <strong>Circle Size:</strong> Represents the number of
                  descendant concepts
                </Text>
                <Text fontSize="sm" color="gray.fg">
                  <strong>Radial Layout:</strong> Parent-child relationships
                  shown through positioning
                </Text>
                <Text fontSize="sm" color="gray.fg">
                  <strong>Color Encoding:</strong> Visual distinction between
                  concept categories
                </Text>
              </VStack>
            </Box>
          </Stack>
        </TwoPanelWithScroll.RightPanel>
      </TwoPanelWithScroll>
    </Page>
  );
}
