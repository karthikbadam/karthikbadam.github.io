import { Box } from "@chakra-ui/react";
import { AxisBottom } from "@visx/axis";
import { Group } from "@visx/group";
import { scaleLinear, scaleOrdinal } from "@visx/scale";
import { Bar } from "@visx/shape";
import { useTooltip, useTooltipInPortal } from "@visx/tooltip";
import React, { useMemo } from "react";
import { useColorModeValue } from "./ui/color-mode";
import { TimeBucket, BucketSpan } from "../types/traces";

interface GanttChartProps {
  data: TimeBucket[];
  width?: number;
  height?: number;
  onItemClick?: (item: BucketSpan) => void;
}

export const GanttChart: React.FC<GanttChartProps> = ({
  data,
  width = 1000,
  height = 550,
  onItemClick,
}) => {
  const margin = { top: 20, right: 120, bottom: 60, left: 100 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const gridColor = useColorModeValue("#E2E8F0", "#2D3748"); // gray.200 / gray.700
  const axisColor = useColorModeValue("#4A5568", "#A0AEC0"); // gray.600 / gray.400
  const barStroke = useColorModeValue("#fff", "#1A202C"); // white / gray.900
  const labelFill = useColorModeValue("#1A202C", "#F7FAFC"); // gray.900 / gray.50

  // Flatten all items and assign them unique row indices
  const allItems = useMemo(() => {
    const items: (BucketSpan & { bucket_index: number })[] = [];
    data.forEach((bucket, bucketIndex) => {
      bucket.spans.forEach((item) => {
        items.push({ ...item, bucket_index: bucketIndex });
      });
    });
    return items;
  }, [data]);

  // Get item types for color scale
  const itemTypes = useMemo(() => {
    return Array.from(new Set(allItems.map((s) => s.type)));
  }, [allItems]);

  // D3 Observable 10 color scheme
  const color1 = useColorModeValue("#6b8dd6", "#2f4a9e"); // Blue (lighter for light, darker for dark)
  const color2 = useColorModeValue("#efb118", "#c98e0d"); // Gold/Yellow (darker for dark)
  const color3 = useColorModeValue("#ff725c", "#d94e3a"); // Coral/Red (darker for dark)
  const color4 = useColorModeValue("#6cc5b0", "#4d9a88"); // Teal (darker for dark)
  const color5 = useColorModeValue("#3ca951", "#2d7d3c"); // Green (darker for dark)

  const colorScale = scaleOrdinal<string, string>()
    .domain(itemTypes)
    .range([color1, color2, color3, color4, color5]);

  // Time scale
  const minTime = data.length > 0 ? data[0].bucket_start : 0;
  const maxTime =
    data.length > 0 ? data[data.length - 1].bucket_end : minTime + 100;

  const xScale = scaleLinear<number>()
    .domain([0, maxTime - minTime])
    .range([0, innerWidth])
    .nice();

  // Y scale - one row per span
  const rowHeight = 20;
  const rowGap = 4;

  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } =
    useTooltip<BucketSpan>();

  const { containerRef, containerBounds, TooltipInPortal } = useTooltipInPortal(
    {
      scroll: true,
      detectBounds: true,
    }
  );

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
          {/* Grid lines */}
          {xScale.ticks(10).map((tick) => (
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
          ))}

          {/* Render items as horizontal bars */}
          {allItems.map((item, index) => {
            const itemStartTime = item.start_time - minTime;
            const itemX = xScale(itemStartTime);
            const itemWidth = Math.max(
              2,
              xScale(itemStartTime + item.duration) - itemX
            );
            const itemY = index * (rowHeight + rowGap);

            return (
              <Group key={`gantt-item-${index}`}>
                {/* Item bar */}
                <Bar
                  x={itemX}
                  y={itemY}
                  width={itemWidth}
                  height={rowHeight}
                  fill={colorScale(item.type)}
                  stroke={barStroke}
                  strokeWidth={1}
                  style={{ cursor: onItemClick ? "pointer" : "default" }}
                  onClick={() => onItemClick?.(item)}
                  onMouseMove={(event) => {
                    showTooltip({
                      tooltipData: item,
                      tooltipLeft: event.clientX - containerBounds.left,
                      tooltipTop: event.clientY - containerBounds.top,
                    });
                  }}
                  onMouseLeave={hideTooltip}
                />

                {/* Item label (if wide enough) */}
                {itemWidth > 20 && (
                  <text
                    x={itemX + 4}
                    y={itemY + rowHeight / 2}
                    dy=".35em"
                    fontSize={10}
                    fill={labelFill}
                    style={{ pointerEvents: "none" }}
                  >
                    {item.name.length > itemWidth / 5
                      ? item.name.substring(0, 7) + "..."
                      : item.name}
                  </text>
                )}
              </Group>
            );
          })}

          {/* X-axis */}
          <AxisBottom
            scale={xScale}
            top={innerHeight}
            stroke={axisColor}
            tickStroke={axisColor}
            tickFormat={(value) => {
              const totalSeconds = Math.floor(value as number);
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = totalSeconds % 60;
              return `${minutes}:${seconds.toString().padStart(2, "0")}`;
            }}
            tickLabelProps={() => ({
              fill: axisColor,
              fontSize: 10,
              textAnchor: "middle",
            })}
            label="Time (MM:SS)"
            labelProps={{
              fontSize: 12,
              fill: axisColor,
              textAnchor: "middle",
            }}
          />

          {/* Y-axis labels */}
          {allItems.map((item, index) => (
            <text
              key={`gantt-label-${index}`}
              x={-10}
              y={index * (rowHeight + rowGap) + rowHeight / 2}
              dy=".35em"
              fontSize={10}
              fill={axisColor}
              textAnchor="end"
              style={{ userSelect: "none" }}
            >
              {item.type}
            </text>
          ))}

          {/* Legend */}
          <Group left={innerWidth + 20} top={0}>
            {itemTypes.map((type, i) => (
              <Group key={`gantt-legend-${i}`} top={i * 20}>
                <rect width={12} height={12} fill={colorScale(type)} />
                <text
                  x={16}
                  y={10}
                  fontSize={11}
                  fill={axisColor}
                  style={{ userSelect: "none" }}
                >
                  {type}
                </text>
              </Group>
            ))}
          </Group>
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
            <strong>{tooltipData.name}</strong>
            <br />
            Type: {tooltipData.type}
            <br />
            Duration: {tooltipData.duration.toFixed(3)}s
          </div>
        </TooltipInPortal>
      )}
    </Box>
  );
};
