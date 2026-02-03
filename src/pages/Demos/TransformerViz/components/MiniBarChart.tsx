/**
 * MiniBarChart - Reusable SVG bar chart component for TokenList and LayerStrip
 *
 * Used in:
 * - TokenList: Shows metric values across layers for each token (horizontal bars)
 * - LayerStrip: Shows metric values across tokens for each layer (vertical bars)
 */

interface MiniBarChartProps {
  data?: number[];
  width?: number;
  height?: number;
  vertical?: boolean; // For layer strip (bars go up/down)
}

export function MiniBarChart({
  data,
  width = 50,
  height = 10,
  vertical = false,
}: MiniBarChartProps) {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const barSize = (vertical ? width : height) / data.length;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {data.map((v, i) => {
        const normalized = (v - min) / range;
        if (vertical) {
          // Vertical bars (for layer strip) - bars grow upward
          const barHeight = normalized * height;
          return (
            <rect
              key={i}
              x={i * barSize}
              y={height - barHeight}
              width={Math.max(barSize - 0.5, 1)}
              height={barHeight}
              fill="currentColor"
              opacity="0.6"
            />
          );
        } else {
          // Horizontal bars (for token list) - bars grow rightward
          const barWidth = normalized * width;
          return (
            <rect
              key={i}
              x={0}
              y={i * barSize}
              width={barWidth}
              height={Math.max(barSize - 0.5, 1)}
              fill="currentColor"
              opacity="0.6"
            />
          );
        }
      })}
    </svg>
  );
}
