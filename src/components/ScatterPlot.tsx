import { Box } from "@chakra-ui/react";
import { Axis } from "@visx/axis";
import { localPoint } from "@visx/event";
import { Group } from "@visx/group";
import { scaleLinear, scaleOrdinal } from "@visx/scale";
import { Circle } from "@visx/shape";
import { Text } from "@visx/text";
import { useTooltip, useTooltipInPortal } from "@visx/tooltip";
import { schemeCategory10 } from "d3";
import React, { useMemo } from "react";
import { useColorModeValue } from "./ui/color-mode";

interface Point {
  x: number;
  y: number;
  label: string;
  category: string;
}

interface ScatterPlotProps {
  data: Point[];
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
}

// Custom LabelText component to prevent label overflow
const LabelText: React.FC<{
  x: number;
  y: number;
  label: string;
  innerWidth: number;
  innerHeight: number;
}> = ({ x, y, label, innerWidth, innerHeight }) => {
  const labelWidth = 80; // Approximate width of label in px
  const labelHeight = 12; // Approximate height of label in px

  // Default: label to the right
  let xPos = x + 8;
  let yPos = y + 4;
  let anchor: "start" | "end" = "start";

  // If too close to right edge, put label to the left
  if (x + labelWidth > innerWidth) {
    xPos = x - 8;
    anchor = "end";
  }
  // If too close to left edge, keep to the right
  if (x - labelWidth < 0) {
    xPos = x + 8;
    anchor = "start";
  }
  // If too close to bottom, nudge up
  if (y > innerHeight) {
    yPos = y - 8;
  }
  // If too close to top, nudge down
  if (y - labelHeight < 0) {
    yPos = y + labelHeight;
  }

  return (
    <Text
      x={xPos}
      y={yPos}
      fill="#666"
      cursor="default"
      style={{
        fontSize: "0.8em",
      }}
      textAnchor={anchor}
    >
      {label}
    </Text>
  );
};

export const ScatterPlot: React.FC<ScatterPlotProps> = ({
  data,
  width = 600,
  height = 400,
  xLabel,
  yLabel,
}) => {
  const margin = { top: 40, right: 20, bottom: 40, left: 20 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const gridColor = useColorModeValue("#dedede", "#222");

  // Sample points across categories, ensuring representation from each category
  const NUM_SAMPLE_POINTS = 8;
  const labeledPoints = useMemo(() => {
    if (data.length <= NUM_SAMPLE_POINTS) return data;

    // Group points by category
    const pointsByCategory = data.reduce((acc, point) => {
      if (!acc[point.category]) {
        acc[point.category] = [];
      }
      acc[point.category].push(point);
      return acc;
    }, {} as Record<string, typeof data>);

    // Sample points from each category
    const categories = Object.keys(pointsByCategory);
    const pointsPerCategory = Math.ceil(NUM_SAMPLE_POINTS / categories.length);

    return categories.flatMap((category) => {
      const points = pointsByCategory[category];
      return points.slice(0, pointsPerCategory);
    });
  }, [data]);

  const xScale = scaleLinear({
    domain: [
      Math.min(...data.map((d) => d.x)),
      Math.max(...data.map((d) => d.x)),
    ],
    nice: true,
    range: [0, innerWidth],
  });

  const yScale = scaleLinear({
    domain: [
      Math.min(...data.map((d) => d.y)),
      Math.max(...data.map((d) => d.y)),
    ],
    nice: true,
    range: [innerHeight, 0],
  });

  const colorScale = (category: string) => {
    const categories = Array.from(new Set(data.map((d) => d.category)));
    const scale = scaleOrdinal().domain(categories).range(schemeCategory10);
    return (scale(category) as string) || "#000000";
  };

  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } =
    useTooltip<Point>();

  const { containerRef, containerBounds, TooltipInPortal } = useTooltipInPortal(
    {
      scroll: true,
      detectBounds: true,
    }
  );

  // Generate grid lines
  const xGridLines = xScale
    .ticks(5)
    .map((tick) => (
      <line
        key={`x-grid-${tick}`}
        x1={xScale(tick)}
        y1={0}
        x2={xScale(tick)}
        y2={innerHeight}
        stroke={gridColor}
        strokeWidth={1}
        strokeDasharray="2,2"
      />
    ));

  const yGridLines = yScale
    .ticks(5)
    .map((tick) => (
      <line
        key={`y-grid-${tick}`}
        x1={0}
        y1={yScale(tick)}
        x2={innerWidth}
        y2={yScale(tick)}
        stroke={gridColor}
        strokeWidth={1}
        strokeDasharray="2,2"
      />
    ));

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
          {/* Grid Lines */}
          <g className="grid-lines">
            {xGridLines}
            {yGridLines}
          </g>

          {/* Axes */}
          {xLabel && (
            <Axis
              orientation="bottom"
              scale={xScale}
              top={innerHeight}
              stroke="var(--axis-color, #666)"
              tickStroke="var(--axis-color, #666)"
              tickLabelProps={() => ({
                fill: "var(--text-color, #666)",
                fontSize: 10,
                textAnchor: "middle",
                dy: "0.5em",
              })}
              hideAxisLine
              hideTicks
              numTicks={5}
              label={xLabel}
              labelProps={{
                fontSize: 12,
                fill: "var(--text-color, #666)",
                textAnchor: "middle",
                y: 35,
              }}
            />
          )}
          {yLabel && (
            <Axis
              orientation="left"
              scale={yScale}
              stroke="var(--axis-color, #666)"
              tickStroke="var(--axis-color, #666)"
              tickLabelProps={() => ({
                fill: "var(--text-color, #666)",
                fontSize: 10,
                textAnchor: "end",
                dx: "-0.5em",
              })}
              hideAxisLine
              hideTicks
              numTicks={5}
              label={yLabel}
              labelProps={{
                fontSize: 12,
                fill: "var(--text-color, #666)",
                textAnchor: "middle",
                transform: `rotate(-90, -35, ${innerHeight / 2})`,
              }}
            />
          )}

          {/* Points */}
          {data.map((point, i) => (
            <Group
              key={i}
              onMouseMove={(event: React.MouseEvent) => {
                const coords = localPoint(event);
                if (coords) {
                  showTooltip({
                    tooltipData: point,
                    tooltipLeft: event.clientX - containerBounds.left,
                    tooltipTop: event.clientY - containerBounds.top,
                  });
                }
              }}
              onMouseLeave={hideTooltip}
            >
              <Circle
                cx={xScale(point.x)}
                cy={yScale(point.y)}
                r={5}
                fill={colorScale(point.category)}
              />
              {labeledPoints.includes(point) && (
                <LabelText
                  x={xScale(point.x)}
                  y={yScale(point.y)}
                  label={point.label}
                  innerWidth={innerWidth}
                  innerHeight={innerHeight}
                />
              )}
            </Group>
          ))}
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
            padding: "8px",
            borderRadius: "4px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            fontSize: "12px",
            pointerEvents: "none",
          }}
        >
          <div>
            <strong>{tooltipData.label}</strong>
            <br />
            Category: {tooltipData.category}
            <br />
            Position: ({tooltipData.x.toFixed(2)}, {tooltipData.y.toFixed(2)})
          </div>
        </TooltipInPortal>
      )}
    </Box>
  );
};
