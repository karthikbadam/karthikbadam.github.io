import { useRef, useEffect, useMemo } from "react";
import { Box, Text, HStack } from "@chakra-ui/react";
import { Group } from "@visx/group";
import { useTransformer } from "../../../contexts/TransformerContext";

interface Node {
  id: string;
  type: "embed" | "norm" | "attn" | "mlp" | "output";
  layer: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  paramCount: number;
  targetX?: number; // Pre-calculated horizontal position for force layout
}

interface Edge {
  source: string | Node;
  target: string | Node;
  type: "flow" | "residual";
}

const LAYERS_PER_ROW = 4;
const ROW_HEIGHT = 150; // Vertical space per row (accommodates nested components)
const COL_WIDTH = 250; // Horizontal space per column
const COL_START = 100; // Starting X position for first column
const HEADER = 60;
const FOOTER = 60;
const EMBEDDING_OFFSET = 20; // Space above first layer for embedding node

export function ArchitectureGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const {
    state,
    numLayers,
    tensors,
    selectedLayer,
    selectedModule,
    selectedNormType,
    setSelection,
  } = useTransformer();

  // Build edges first (needed for force layout)
  const edges = useMemo(() => {
    const edgeList: Edge[] = [];

    // Embedding to first layer
    edgeList.push({ source: "embed", target: "L0.input_norm", type: "flow" });

    // Layer-to-layer flow
    for (let layer = 0; layer < numLayers; layer++) {
      // Within layer
      edgeList.push({
        source: `L${layer}.input_norm`,
        target: `L${layer}.attn`,
        type: "flow",
      });
      edgeList.push({
        source: `L${layer}.attn`,
        target: `L${layer}.post_norm`,
        type: "residual",
      });
      edgeList.push({
        source: `L${layer}.post_norm`,
        target: `L${layer}.mlp`,
        type: "flow",
      });
      edgeList.push({
        source: `L${layer}.mlp`,
        target: `L${layer}.post_norm`,
        type: "residual",
      });

      // Between layers
      if (layer < numLayers - 1) {
        edgeList.push({
          source: `L${layer}.mlp`,
          target: `L${layer + 1}.input_norm`,
          type: "flow",
        });
      }
    }

    // Last layer to final norm
    edgeList.push({
      source: `L${numLayers - 1}.mlp`,
      target: "final_norm",
      type: "flow",
    });

    // Final norm to LM head
    edgeList.push({ source: "final_norm", target: "lm_head", type: "flow" });

    return edgeList;
  }, [numLayers]);

  // Build nodes from model structure and apply grid layout
  const nodes = useMemo(() => {
    const nodeList: Node[] = [];

    // Embedding
    nodeList.push({
      id: "embed",
      type: "embed",
      layer: null,
      x: 0, // Will be positioned by grid logic
      y: 0,
      width: 200,
      height: 40,
      label: "Embedding",
      paramCount: 262668288,
    });

    // Per-layer nodes
    for (let layer = 0; layer < numLayers; layer++) {
      // Input norm
      nodeList.push({
        id: `L${layer}.input_norm`,
        type: "norm",
        layer,
        x: 0, // Will be positioned by grid logic
        y: 0,
        width: 180,
        height: 28,
        label: "LayerNorm",
        paramCount: 2048,
      });

      // Attention
      const attnTensor = tensors.find(
        (t) => t.layer === layer && t.module === "attn" && t.role === "q"
      );
      nodeList.push({
        id: `L${layer}.attn`,
        type: "attn",
        layer,
        x: 0, // Will be positioned by grid logic
        y: 0,
        width: 180,
        height: 50,
        label: "Attention",
        paramCount: attnTensor ? attnTensor.param_count * 4 : 0,
      });

      // Post norm
      nodeList.push({
        id: `L${layer}.post_norm`,
        type: "norm",
        layer,
        x: 0, // Will be positioned by grid logic
        y: 0,
        width: 180,
        height: 28,
        label: "LayerNorm",
        paramCount: 2048,
      });

      // MLP
      const mlpTensor = tensors.find(
        (t) => t.layer === layer && t.module === "mlp" && t.role === "gate"
      );
      nodeList.push({
        id: `L${layer}.mlp`,
        type: "mlp",
        layer,
        x: 0, // Will be positioned by grid logic
        y: 0,
        width: 180,
        height: 50,
        label: "MLP",
        paramCount: mlpTensor ? mlpTensor.param_count * 3 : 0,
      });
    }

    // Final norm
    nodeList.push({
      id: "final_norm",
      type: "norm",
      layer: null,
      x: 0, // Will be positioned by grid logic
      y: 0,
      width: 180,
      height: 28,
      label: "Final Norm",
      paramCount: 2048,
    });

    // LM Head
    nodeList.push({
      id: "lm_head",
      type: "output",
      layer: null,
      x: 0, // Will be positioned by grid logic
      y: 0,
      width: 200,
      height: 40,
      label: "LM Head",
      paramCount: 0, // Tied
    });

    // Calculate grid-based positions for nodes
    // Grid layout: 4 layers per row, components nested vertically within each grid cell
    const numRows = Math.ceil(numLayers / LAYERS_PER_ROW);
    const centerX = COL_START + (LAYERS_PER_ROW - 1) * COL_WIDTH / 2;
    
    const getGridPosition = (layer: number | null, componentType: string): { x: number; y: number } => {
      if (layer === null) {
        // Embedding, final_norm, lm_head - center horizontally
        if (componentType === "embed") {
          return { x: centerX, y: EMBEDDING_OFFSET };
        } else if (componentType === "final_norm") {
          return { x: centerX, y: HEADER + numRows * ROW_HEIGHT + 20 };
        } else if (componentType === "lm_head") {
          return { x: centerX, y: HEADER + numRows * ROW_HEIGHT + 60 };
        }
      }
      
      // Calculate grid position for layers
      const row = Math.floor(layer! / LAYERS_PER_ROW);
      const col = layer! % LAYERS_PER_ROW;
      const columnCenterX = COL_START + col * COL_WIDTH + COL_WIDTH / 2;
      const baseY = HEADER + row * ROW_HEIGHT;
      
      // Component offsets within layer (vertical nesting)
      let componentOffset = 0;
      if (componentType.includes("input_norm")) {
        componentOffset = 10;
      } else if (componentType.includes("attn")) {
        componentOffset = 40;
      } else if (componentType.includes("post_norm")) {
        componentOffset = 70;
      } else if (componentType.includes("mlp")) {
        componentOffset = 100;
      }
      
      return { x: columnCenterX, y: baseY + componentOffset };
    };

    // Position all nodes using grid layout
    nodeList.forEach((node) => {
      if (node.layer === null) {
        // Special nodes (embed, final_norm, lm_head)
        const pos = getGridPosition(null, node.id);
        node.x = pos.x;
        node.y = pos.y;
      } else {
        // Layer nodes - use grid positioning
        const pos = getGridPosition(node.layer, node.id);
        node.x = pos.x;
        node.y = pos.y;
      }
    });

    return nodeList;
  }, [numLayers, tensors, edges]);


  // Calculate dimensions based on grid layout
  const nodeBounds = useMemo(() => {
    if (nodes.length === 0) {
      const numRows = Math.ceil(numLayers / LAYERS_PER_ROW);
      return { 
        minX: 0, 
        maxX: COL_START + COL_WIDTH * LAYERS_PER_ROW, 
        minY: 0, 
        maxY: HEADER + numRows * ROW_HEIGHT + 100 
      };
    }
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const numRows = Math.ceil(numLayers / LAYERS_PER_ROW);
    return {
      minX: Math.min(...xs) - 50,
      maxX: Math.max(...xs) + 50,
      minY: Math.min(...ys) - 50, // Increased padding to ensure embedding is visible
      maxY: HEADER + numRows * ROW_HEIGHT + 100, // Account for final_norm and lm_head
    };
  }, [nodes, numLayers]);

  const width = Math.max(COL_START + COL_WIDTH * LAYERS_PER_ROW, nodeBounds.maxX - nodeBounds.minX);
  const totalHeight = Math.max(600, nodeBounds.maxY - nodeBounds.minY + FOOTER + 50); // Extra padding for embedding

  // Pan and zoom handlers - use refs for smooth panning
  useEffect(() => {
    if (!containerRef.current || !groupRef.current || !svgRef.current) return;

    const container = containerRef.current;
    const group = groupRef.current;
    const svg = svgRef.current;
    let isPanning = false;
    let startX = 0;
    let startY = 0;

    // Update transform directly on DOM for smooth panning
    const updateTransform = () => {
      group.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`;
      group.style.transformOrigin = "0 0";
    };

    // Mouse down - start panning
    const handleMouseDown = (e: MouseEvent) => {
      // Allow panning with left or middle mouse button
      if (e.button === 0 || e.button === 1) {
        isPanning = true;
        startX = e.clientX - panRef.current.x;
        startY = e.clientY - panRef.current.y;
        container.style.cursor = "grabbing";
        e.preventDefault();
      }
    };

    // Mouse move - panning
    const handleMouseMove = (e: MouseEvent) => {
      if (isPanning) {
        panRef.current.x = e.clientX - startX;
        panRef.current.y = e.clientY - startY;
        updateTransform();
      }
    };

    // Mouse up - stop panning
    const handleMouseUp = () => {
      if (isPanning) {
        isPanning = false;
        container.style.cursor = "grab";
      }
    };

    // Mouse leave - stop panning
    const handleMouseLeave = () => {
      if (isPanning) {
        isPanning = false;
        container.style.cursor = "grab";
      }
    };

    // Wheel - zoom (slower zoom speed)
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.95 : 1.05; // Slower zoom increments
      zoomRef.current = Math.max(0.2, Math.min(5, zoomRef.current * delta));
      updateTransform();
    };

    svg.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    svg.addEventListener("mouseleave", handleMouseLeave);
    container.addEventListener("wheel", handleWheel, { passive: false });
    
    // Initial transform
    updateTransform();

    return () => {
      svg.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      svg.removeEventListener("mouseleave", handleMouseLeave);
      container.removeEventListener("wheel", handleWheel);
    };
  }, []); // No dependencies - setup once


  const handleNodeClick = (node: Node) => {
    if (node.type === "embed") {
      setSelection(null, "embed");
    } else if (node.type === "norm") {
      // Extract norm type from node ID: L{layer}.input_norm, L{layer}.post_norm, or final_norm
      let normType: 'input_norm' | 'post_norm' | 'final_norm' = 'input_norm';
      if (node.id === "final_norm") {
        normType = "final_norm";
      } else if (node.id.includes("post_norm")) {
        normType = "post_norm";
      } else if (node.id.includes("input_norm")) {
        normType = "input_norm";
      }
      setSelection(node.layer, "norm", normType);
    } else if (node.type === "attn") {
      setSelection(node.layer, "attn");
    } else if (node.type === "mlp") {
      setSelection(node.layer, "mlp");
    }
  };

  const getNodeColor = (node: Node) => {
    const isSelected =
      ((node.type === "embed" && selectedModule === "embed") ||
       (node.type === "norm" && selectedModule === "norm" && 
        ((node.id === "final_norm" && selectedLayer === null && selectedNormType === "final_norm") ||
         (node.layer !== null && selectedLayer === node.layer && 
          ((node.id.includes("input_norm") && selectedNormType === "input_norm") ||
           (node.id.includes("post_norm") && selectedNormType === "post_norm"))))) ||
       (selectedLayer !== null &&
        node.layer === selectedLayer &&
        ((node.type === "attn" && selectedModule === "attn") ||
         (node.type === "mlp" && selectedModule === "mlp"))));
    
    if (isSelected) {
      return "#3182ce"; // blue.500
    }
    
    switch (node.type) {
      case "embed":
      case "output":
        return "#e5e7eb"; // gray.200
      case "norm":
        return "#2dd4bf"; // teal.400
      case "attn":
        return "#60a5fa"; // blue.400
      case "mlp":
        return "#fb923c"; // orange.400
      default:
        return "#d1d5db"; // gray.300
    }
  };

  if (state.status !== "ready") {
    return (
      <Box bg="bg.panel" borderRadius="lg" p={4} h="100%">
        <Text>Loading architecture graph...</Text>
      </Box>
    );
  }

  return (
    <Box
      bg="bg.panel"
      borderRadius="lg"
      p={2}
      h="100%"
      display="flex"
      flexDirection="column"
      border="1px solid"
      borderColor="gray.subtle"
      overflow="hidden"
    >
      <HStack justify="space-between" mb={1}>
        <Text fontSize="xs" fontWeight="semibold" color="accentSubtle">
          Architecture Overview
          <Text as="span" fontWeight="normal" color="fg.muted" ml={1}>
            • Click nodes to explore • Drag to pan • Scroll to zoom
          </Text>
        </Text>
      </HStack>
      <Box
        ref={containerRef}
        flex="1"
        overflow="auto"
        borderRadius="md"
        position="relative"
        border="1px solid"
        borderColor="gray.subtle"
        style={{ cursor: "grab" }}
      >
        <svg
          ref={svgRef}
          width={width}
          height={totalHeight}
          style={{ display: "block", cursor: "grab" }}
        >
          <g ref={groupRef}>
            {/* Edges - render behind nodes with curves */}
            {edges.map((edge, idx) => {
              const sourceNode = nodes.find((n) => n.id === edge.source);
              const targetNode = nodes.find((n) => n.id === edge.target);
              if (!sourceNode || !targetNode) return null;

              const sourceX = sourceNode.x + sourceNode.width / 2;
              const sourceY = sourceNode.y + sourceNode.height;
              const targetX = targetNode.x + targetNode.width / 2;
              const targetY = targetNode.y;

              // Calculate control points for quadratic bezier curve
              const dx = targetX - sourceX;
              const dy = targetY - sourceY;
              const distance = Math.sqrt(dx * dx + dy * dy);
              const curvature = Math.min(distance * 0.2, 50); // Adaptive curvature based on distance
              
              // Control point is offset perpendicular to the line direction
              const angle = Math.atan2(dy, dx);
              const perpAngle = angle + Math.PI / 2;
              const controlX = sourceX + dx * 0.5 + Math.cos(perpAngle) * curvature;
              const controlY = sourceY + dy * 0.5 + Math.sin(perpAngle) * curvature;

              // Create quadratic bezier path
              const pathData = `M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`;

              const strokeColor = edge.type === "residual" ? "#4ade80" : "#6b7280";
              const strokeWidth = edge.type === "residual" ? 3 : 2;

              return (
                <path
                  key={idx}
                  d={pathData}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeOpacity={0.9}
                  markerEnd={edge.type === "residual" ? undefined : "url(#arrowhead)"}
                  style={{ pointerEvents: "none" }}
                />
              );
            })}
            
            {/* Arrow marker definition for flow edges */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <polygon
                  points="0 0, 10 3, 0 6"
                  fill="#6b7280"
                  fillOpacity={0.9}
                />
              </marker>
            </defs>

            {/* Nodes */}
            {nodes.map((node) => (
              <Group key={node.id}>
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={node.type === "norm" ? 4 : 8}
                  fill={getNodeColor(node)}
                  stroke={
                    ((node.type === "embed" && selectedModule === "embed") ||
                     (node.type === "norm" && selectedModule === "norm" &&
                      ((node.id === "final_norm" && selectedLayer === null && selectedNormType === "final_norm") ||
                       (node.layer !== null && selectedLayer === node.layer && 
                        ((node.id.includes("input_norm") && selectedNormType === "input_norm") ||
                         (node.id.includes("post_norm") && selectedNormType === "post_norm"))))) ||
                     (selectedLayer !== null &&
                      node.layer === selectedLayer &&
                      ((node.type === "attn" && selectedModule === "attn") ||
                       (node.type === "mlp" && selectedModule === "mlp"))))
                      ? "#2563eb"
                      : "#9ca3af"
                  }
                  strokeWidth={2}
                  cursor="pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNodeClick(node);
                  }}
                  onMouseDown={(e) => {
                    // Prevent panning when clicking on nodes
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  style={{ transition: "all 0.2s" }}
                />
                <text
                  x={node.x + node.width / 2}
                  y={node.y + node.height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="10"
                  fill="white"
                  fontWeight="semibold"
                  pointerEvents="none"
                >
                  {node.label}
                  {node.layer !== null && ` ${node.layer}`}
                </text>
              </Group>
            ))}
          </g>
        </svg>
      </Box>
    </Box>
  );
}
