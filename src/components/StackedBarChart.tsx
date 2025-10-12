import { Box } from "@chakra-ui/react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Group } from "@visx/group";
import { scaleLinear, scaleOrdinal } from "@visx/scale";
import { Bar } from "@visx/shape";
import { useTooltip, useTooltipInPortal } from "@visx/tooltip";
import { schemeCategory10 } from "d3";
import React, { useMemo } from "react";
import { useColorModeValue } from "./ui/color-mode";
import type { AggregatedBucket } from "@/hooks/useTraceData";

interface StackedBarChartProps {
  data: AggregatedBucket[];
  width?: number;
  height?: number;
}

export const StackedBarChart: React.FC<StackedBarChartProps> = ({
  data,
  width = 800,
  height = 400,
}) => {
  const margin = { top: 20, right: 120, bottom: 60, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const gridColor = useColorModeValue("#dedede", "#222");
  const axisColor = useColorModeValue("#666", "#aaa");

  // Get all span types for color scale
  const spanTypes = useMemo(() => {
    const types = new Set<string>();
    data.forEach((bucket) => {
      Object.keys(bucket.by_type).forEach(type => types.add(type));
    });
    return Array.from(types);
  }, [data]);

  const colorScale = scaleOrdinal<string, string>()
    .domain(spanTypes)
    .range(schemeCategory10);

  // X scale: continuous time scale based on actual span start times
  const minTime = data.length > 0 ? data[0].bucket_start : 0;
  const maxTime = data.length > 0 ? data[data.length - 1].bucket_end : minTime + 100;
  
  const xScale = scaleLinear<number>()
    .domain([0, maxTime - minTime])
    .range([0, innerWidth])
    .nice();

  // Y scale: duration
  const maxDuration = useMemo(() => {
    return Math.max(...data.map(bucket => {
      return Object.values(bucket.by_type).reduce((sum, val) => sum + val, 0);
    }));
  }, [data]);

  const yScale = scaleLinear<number>()
    .domain([0, maxDuration])
    .range([innerHeight, 0])
    .nice();

  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } =
    useTooltip<{ type: string; duration: number }>();

  const { containerRef, TooltipInPortal } = useTooltipInPortal({
    scroll: true,
    detectBounds: true,
  });

  // Render stacked bars
  const renderBars = () => {
    const minTime = data.length > 0 ? data[0].bucket_start : 0;
    const bucketSize = data.length > 1 ? 
      (data[1].bucket_start - data[0].bucket_start) : 10;
    
    return data.map((bucket, bucketIndex) => {
      const bucketStartTime = bucket.bucket_start - minTime;
      const bucketWidth = xScale(bucketStartTime + bucketSize) - xScale(bucketStartTime);
      let yOffset = 0;

      return (
        <Group key={bucketIndex} left={xScale(bucketStartTime)}>
          {Object.entries(bucket.by_type).map(([type, duration]) => {
            const barHeight = innerHeight - yScale(duration);
            const bar = (
              <Bar
                key={type}
                x={0}
                y={yScale(duration) - yOffset}
                width={bucketWidth}
                height={barHeight}
                fill={colorScale(type)}
                onMouseMove={(event) => {
                  const coords = { x: event.clientX, y: event.clientY };
                  showTooltip({
                    tooltipData: { type, duration },
                    tooltipLeft: coords.x,
                    tooltipTop: coords.y,
                  });
                }}
                onMouseLeave={hideTooltip}
              />
            );
            yOffset += barHeight;
            return bar;
          })}
        </Group>
      );
    });
  };

  // Legend
  const renderLegend = () => {
    return (
      <Group left={innerWidth + 20} top={0}>
        {spanTypes.map((type, i) => (
          <Group key={type} top={i * 20}>
            <rect width={12} height={12} fill={colorScale(type)} />
            <text
              x={16}
              y={10}
              fontSize={11}
              fill={axisColor}
              style={{ userSelect: 'none' }}
            >
              {type}
            </text>
          </Group>
        ))}
      </Group>
    );
  };

  return (
    <Box
      style={{ width: '100%', maxWidth: width, margin: '0 auto' }}
      position="relative"
    >
      <svg
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        viewBox={`0 0 ${width} ${height}`}
        style={{ userSelect: 'none' }}
        ref={containerRef}
      >
        <Group left={margin.left} top={margin.top}>
          {/* Grid lines */}
          {yScale.ticks(5).map((tick) => (
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
          ))}

          {/* Bars */}
          {renderBars()}

          {/* Axes */}
          <AxisBottom
            scale={xScale}
            top={innerHeight}
            stroke={axisColor}
            tickStroke={axisColor}
            tickFormat={(value) => {
              // Format as MM:SS
              const totalSeconds = Math.floor(value as number);
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = totalSeconds % 60;
              return `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }}
            tickLabelProps={() => ({
              fill: axisColor,
              fontSize: 10,
              textAnchor: 'middle',
            })}
            label="Time (MM:SS)"
            labelProps={{
              fontSize: 12,
              fill: axisColor,
              textAnchor: 'middle',
            }}
          />
          <AxisLeft
            scale={yScale}
            stroke={axisColor}
            tickStroke={axisColor}
            tickLabelProps={() => ({
              fill: axisColor,
              fontSize: 10,
              textAnchor: 'end',
              dx: '-0.5em',
            })}
            label="Duration (s)"
            labelProps={{
              fontSize: 12,
              fill: axisColor,
              textAnchor: 'middle',
            }}
          />

          {/* Legend */}
          {renderLegend()}
        </Group>
      </svg>

      {/* Tooltip */}
      {tooltipData && (
        <TooltipInPortal
          left={tooltipLeft}
          top={tooltipTop}
          style={{
            position: 'absolute',
            backgroundColor: 'var(--tooltip-bg, white)',
            color: 'var(--tooltip-text, #333)',
            padding: '8px',
            borderRadius: '4px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            fontSize: '12px',
            pointerEvents: 'none',
          }}
        >
          <div>
            Type: {tooltipData.type}
            <br />
            Duration: {tooltipData.duration.toFixed(3)}s
          </div>
        </TooltipInPortal>
      )}
    </Box>
  );
};

