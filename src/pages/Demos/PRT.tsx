import {
  Badge,
  Box,
  Button,
  Grid,
  Heading,
  HStack,
  Link,
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
import { Page } from "../../components/Page";
import { useColorMode } from "../../components/ui/color-mode";
import { LuExternalLink } from "react-icons/lu";

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
    return descendants.slice(0, 20); // Limit to first 20 for display
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
      {/* TODO: Fix the height hardcoding - inconsistent height values between Grid maxH and Box h */}
      <Grid
        templateColumns={{ base: "1fr", lg: "2fr 50ch" }}
        overflowY="auto"
        px={7}
      >
        {/* Left Column - Visualization (Full Height) */}
        <Box h="75vh">
          {uatData && (
            <PackedRadialTree
              data={uatData}
              onNodeSelect={handleNodeSelect}
              options={config}
            />
          )}
        </Box>

        {/* Right Column - Content */}
        <Box
          maxW="72ch"
          mx="auto"
          pr={10}
          maxH="calc(100vh - 120px)"
          overflow="auto"
        >
          <Stack gap={6}>
            {/* Header */}
            <Box>
              <Heading as="h1" size="2xl" color="accent">
                Packed Radial Tree
              </Heading>
              <Text fontSize="sm" color="gray.focusRing" mb={4}>
                Custom-designed visualization by Karthik Badam, May 26, 2025.
              </Text>
              <Text fontSize="sm" color="gray.fg">
                Explore and learn astronomy concepts from the Unified Astronomy
                Thesaurus (UAT) using this visualization. Each circle is a
                concept in the thesaurus. Pick a circle to reveal the concepts
                within the broader area. Double click to the drill down the
                hierarchy.
              </Text>
            </Box>

            {/* Selected Node Details */}
            {selectedNode ? (
              <Box>
                <Heading as="h2" size="md" mb={1}>
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
                          DESCENDANT CONCEPTS ({descendants.length}
                          {getDescendants(selectedNode).length > 20
                            ? `/${getDescendants(selectedNode).length}`
                            : ""}
                          )
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
                <Heading as="h2" size="md" mb={1}>
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
              <Heading as="h2" size="md" mb={1}>
                Interaction Guide
              </Heading>
              <VStack gap={2} align="stretch">
                <Text fontSize="sm">
                  • <strong>Click</strong> any node to select and explore
                </Text>
                <Text fontSize="sm">
                  • <strong>Hover</strong> for detailed tooltips
                </Text>
                <Text fontSize="sm">
                  • <strong>Zoom</strong> with mouse wheel or trackpad
                </Text>
                <Text fontSize="sm">
                  • <strong>Pan</strong> by dragging the background
                </Text>
              </VStack>
            </Box>

            {/* Dataset Description */}
            <Box>
              <Heading as="h2" size="md" mb={2}>
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
              <Heading as="h3" size="md" mb={2}>
                How It Works
              </Heading>
              <VStack gap={3} align="stretch">
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
        </Box>
      </Grid>
    </Page>
  );
}
