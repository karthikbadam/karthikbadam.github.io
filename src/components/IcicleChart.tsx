import { Box } from "@chakra-ui/react";
import { Group } from "@visx/group";
import { hierarchy, partition, HierarchyRectangularNode } from "d3-hierarchy";
import { interpolateBuPu } from "d3-scale-chromatic";
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

interface IcicleChartProps {
  data: IcicleNode;
  width?: number;
  height?: number;
  onNodeClick?: (node: NodeData) => void;
  metric?: string;
}

export const IcicleChart: React.FC<IcicleChartProps> = ({
  data,
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
    const hierarchyRoot = hierarchy(data)
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
  }, [data, innerWidth, innerHeight, metric]);

  const isDarkMode = useColorModeValue(false, true);

  // Find max depth for normalization
  const maxDepth = useMemo(() => {
    let max = 0;
    root.each((node) => {
      if (node.depth > max) max = node.depth;
    });
    return max;
  }, [root]);

  // Color scale based on node depth using continuous D3 BuPu interpolation
  const getNodeColor = (node: HierarchyRectangularNode<IcicleNode>): string => {
    // Normalize depth to 0-1 range
    const normalizedDepth = maxDepth > 0 ? node.depth / maxDepth : 0;

    // In dark mode, reverse the scale (1 - normalizedDepth)
    const t = isDarkMode ? 1 - normalizedDepth : normalizedDepth;

    // Use D3's BuPu interpolator with a range that avoids the very lightest colors
    // Map to 0.2-0.9 range for better visibility
    const scaledT = 0.2 + t * 0.7;

    return interpolateBuPu(scaledT);
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
    let nodeIndex = 0;

    root.each((node) => {
      if (node.x1 - node.x0 < 1 || node.y1 - node.y0 < 1) return; // Skip tiny nodes

      const nodeData = node.data;
      const rectWidth = node.x1 - node.x0;
      const rectHeight = node.y1 - node.y0;

      // Determine if text should be shown
      const showText = rectWidth > 50 && rectHeight > 15;

      nodes.push(
        <Group key={`node-${nodeIndex++}`}>
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
