import { Box } from "@chakra-ui/react";
import { Group } from "@visx/group";
import { hierarchy, partition, HierarchyRectangularNode } from "d3-hierarchy";
import { scaleOrdinal } from "@visx/scale";
import { useTooltip, useTooltipInPortal } from "@visx/tooltip";
import React, { useMemo } from "react";
import { useColorModeValue } from "./ui/color-mode";
import type { IcicleNode } from "@/hooks/useTraceData";

interface NodeData {
  name: string;
  layer: number;
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
}

interface TraceIcicleProps {
  hierarchyData: IcicleNode;
  width?: number;
  height?: number;
  onNodeClick?: (node: NodeData) => void;
  metric?: "duration" | "tokens";
}

export const TraceIcicle: React.FC<TraceIcicleProps> = ({
  hierarchyData,
  width = 1000,
  height = 600,
  onNodeClick,
  metric = "duration",
}) => {
  const margin = { top: 20, right: 20, bottom: 20, left: 20 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const borderColor = useColorModeValue("#fff", "#1A202C"); // white / gray.900
  const textColor = useColorModeValue("#1A202C", "#F7FAFC"); // gray.900 / gray.50

  // Create hierarchy and partition layout
  const root = useMemo(() => {
    const hierarchyRoot = hierarchy(hierarchyData)
      .sum((d) => {
        // Use the specified metric from attributes, fallback to 1
        const value = d.attributes?.[metric];
        return typeof value === "number" && value > 0 ? value : 1;
      })
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const partitionLayout = partition<IcicleNode>()
      .size([innerWidth, innerHeight])
      .padding(1);

    return partitionLayout(hierarchyRoot);
  }, [hierarchyData, innerWidth, innerHeight, metric]);

  // D3 Observable 10 color scheme
  const phaseColor1 = useColorModeValue("#6b8dd6", "#2f4a9e"); // Blue (lighter for light, darker for dark)
  const phaseColor2 = useColorModeValue("#efb118", "#c98e0d"); // Gold/Yellow (darker for dark)
  const phaseColor3 = useColorModeValue("#ff725c", "#d94e3a"); // Coral/Red (darker for dark)
  const phaseColor4 = useColorModeValue("#6cc5b0", "#4d9a88"); // Teal (darker for dark)
  const fallbackColor = useColorModeValue("#9498a0", "#6b6f77"); // Gray (darker for dark)

  const categoryColor1 = useColorModeValue("#6b8dd6", "#2f4a9e"); // Blue (lighter for light, darker for dark)
  const categoryColor2 = useColorModeValue("#efb118", "#c98e0d"); // Gold/Yellow (darker for dark)
  const categoryColor3 = useColorModeValue("#ff725c", "#d94e3a"); // Coral/Red (darker for dark)
  const categoryColor4 = useColorModeValue("#6cc5b0", "#4d9a88"); // Teal (darker for dark)
  const categoryColor5 = useColorModeValue("#3ca951", "#2d7d3c"); // Green (darker for dark)

  // Blue gradient for hierarchy depth (based on Observable blue)
  const depthColor0 = useColorModeValue("#d4e3f7", "#1e2f4a"); // Lightest / Darkest
  const depthColor1 = useColorModeValue("#b3d1f0", "#253a5e"); // Very light / Very dark
  const depthColor2 = useColorModeValue("#8bb5e5", "#2b4572"); // Light / Dark
  const depthColor3 = useColorModeValue("#6b8dd6", "#2f4a9e"); // Medium light / Dark
  const depthColor4 = useColorModeValue("#4269d0", "#3a5cba"); // Base / Darker
  const depthColor5 = useColorModeValue("#3a5cba", "#4269d0"); // Medium dark / Base
  const depthColor6 = useColorModeValue("#2f4a9e", "#6b8dd6"); // Darkest / Medium light

  // Color scale based on node attributes - using Chakra UI colors
  const getNodeColor = (node: HierarchyRectangularNode<IcicleNode>): string => {
    const data = node.data;

    // Color by phase if available
    if (data.attributes?.react_phase) {
      const phaseColors: Record<string, string> = {
        thought: phaseColor1,
        action_llm: phaseColor2,
        action_code: phaseColor3,
        observation: phaseColor4,
      };
      return phaseColors[data.attributes.react_phase] || fallbackColor;
    }

    // Color by category type
    if (data.attributes?.type) {
      const typeColors = scaleOrdinal<string, string>()
        .domain(["AGENT", "CHAIN", "LLM", "TOOL", "INTERNAL"])
        .range([
          categoryColor1,
          categoryColor2,
          categoryColor3,
          categoryColor4,
          categoryColor5,
        ]);
      return typeColors(data.attributes.type);
    }

    // Color by depth - using blue shades for hierarchy depth
    const depthColors = [
      depthColor0,
      depthColor1,
      depthColor2,
      depthColor3,
      depthColor4,
      depthColor5,
      depthColor6,
    ];
    return depthColors[data.layer % depthColors.length];
  };

  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } =
    useTooltip<{ node: HierarchyRectangularNode<IcicleNode> }>();

  const { containerRef, containerBounds, TooltipInPortal } = useTooltipInPortal(
    {
      scroll: true,
      detectBounds: true,
    }
  );

  // Render icicle rectangles
  const renderNodes = () => {
    const nodes: React.ReactNode[] = [];

    root.each((node) => {
      if (node.x1 - node.x0 < 1 || node.y1 - node.y0 < 1) return; // Skip tiny nodes

      const nodeData = node.data;
      const rectWidth = node.x1 - node.x0;
      const rectHeight = node.y1 - node.y0;

      // Determine if text should be shown
      const showText = rectWidth > 50 && rectHeight > 15;

      nodes.push(
        <Group key={`${node.data.name}-${node.depth}`}>
          <rect
            x={node.x0}
            y={node.y0}
            width={rectWidth}
            height={rectHeight}
            fill={getNodeColor(node)}
            stroke={borderColor}
            strokeWidth={1}
            style={{ cursor: onNodeClick ? "pointer" : "default" }}
            onClick={() => {
              if (onNodeClick) {
                onNodeClick({
                  ...nodeData,
                  ...nodeData.attributes,
                  depth: node.depth,
                  value: node.value,
                });
              }
            }}
            onMouseMove={(event) => {
              showTooltip({
                tooltipData: { node },
                tooltipLeft: event.clientX - containerBounds.left,
                tooltipTop: event.clientY - containerBounds.top,
              });
            }}
            onMouseLeave={hideTooltip}
          />
          {showText && (
            <text
              x={node.x0 + rectWidth / 2}
              y={node.y0 + rectHeight / 2}
              fill={textColor}
              fontSize={Math.min(12, rectHeight / 2)}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                pointerEvents: "none",
                userSelect: "none",
                fontWeight: node.depth === 0 ? "bold" : "normal",
              }}
            >
              {truncateText(nodeData.name, rectWidth / 7)}
            </text>
          )}
        </Group>
      );
    });

    return nodes;
  };

  const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  };

  const formatMetricValue = (
    value: number | undefined,
    metricType: string
  ): string => {
    if (value === undefined || value === null) return "N/A";
    if (metricType === "duration") {
      return `${value.toFixed(3)}s`;
    } else if (metricType === "tokens") {
      return value.toLocaleString();
    }
    return value.toString();
  };

  return (
    <Box
      style={{ width: "100%", maxWidth: width, margin: "0 auto" }}
      position="relative"
    >
      <svg
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        viewBox={`0 0 ${width} ${height}`}
        style={{ userSelect: "none" }}
        ref={containerRef}
      >
        <Group left={margin.left} top={margin.top}>
          {renderNodes()}
        </Group>
      </svg>

      {/* Tooltip */}
      {tooltipData && (
        <TooltipInPortal
          left={tooltipLeft}
          top={tooltipTop}
          style={{
            position: "absolute",
            backgroundColor: "var(--tooltip-bg, white)",
            color: "var(--tooltip-text, #333)",
            padding: "12px",
            borderRadius: "4px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            fontSize: "12px",
            pointerEvents: "none",
            maxWidth: "300px",
          }}
        >
          <div>
            <strong style={{ fontSize: "14px" }}>
              {tooltipData.node.data.name}
            </strong>
            <br />
            <span style={{ color: "#666" }}>
              Layer: {tooltipData.node.data.layer}
            </span>
            <br />
            {tooltipData.node.data.attributes?.duration !== undefined && (
              <>
                Duration:{" "}
                {formatMetricValue(
                  tooltipData.node.data.attributes.duration,
                  "duration"
                )}
                <br />
              </>
            )}
            {tooltipData.node.data.attributes?.tokens !== undefined &&
              tooltipData.node.data.attributes.tokens > 0 && (
                <>
                  Tokens:{" "}
                  {formatMetricValue(
                    tooltipData.node.data.attributes.tokens,
                    "tokens"
                  )}
                  <br />
                </>
              )}
            {tooltipData.node.data.attributes?.react_phase && (
              <>
                <span
                  style={{
                    display: "inline-block",
                    marginTop: "4px",
                    padding: "2px 6px",
                    borderRadius: "3px",
                    backgroundColor: getNodeColor(tooltipData.node),
                    color: "white",
                    fontSize: "11px",
                  }}
                >
                  {tooltipData.node.data.attributes.react_phase}
                </span>
                <br />
              </>
            )}
            {tooltipData.node.data.attributes?.span_count !== undefined && (
              <>
                Spans: {tooltipData.node.data.attributes.span_count}
                <br />
              </>
            )}
          </div>
        </TooltipInPortal>
      )}
    </Box>
  );
};
