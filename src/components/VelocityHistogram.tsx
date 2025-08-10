import React from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { scaleLinear } from "@visx/scale";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Brush } from "@visx/brush";
import { Bounds } from "@visx/brush/lib/types";
import { astroDataAtom, velocityFilterAtom } from "../stores/astroStore";

export const VelocityHistogram: React.FC = () => {
  const astroData = useAtomValue(astroDataAtom);
  const setVelocityFilter = useSetAtom(velocityFilterAtom);
  
  const velocities = astroData instanceof Promise ? [] : astroData.dataPoints.map(d => d.velocity);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({ width: 280, height: 180 });

  React.useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({ width: clientWidth, height: clientHeight });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const { width, height } = dimensions;
  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  // Create histogram bins
  const numBins = 20;
  const vMin = Math.min(...velocities);
  const vMax = Math.max(...velocities);
  const binWidth = (vMax - vMin) / numBins;
  
  const bins = Array(numBins).fill(0).map((_, i) => ({
    x: vMin + i * binWidth,
    count: 0,
  }));

  velocities.forEach(v => {
    const binIndex = Math.min(Math.floor((v - vMin) / binWidth), numBins - 1);
    bins[binIndex].count++;
  });

  const maxCount = Math.max(...bins.map(b => b.count));

  // Scales
  const xScale = scaleLinear({
    range: [0, xMax],
    domain: [vMin, vMax],
  });

  const yScale = scaleLinear({
    range: [yMax, 0],
    domain: [0, maxCount],
  });

  const onBrushChange = (domain: Bounds | null) => {
    if (!domain) {
      setVelocityFilter(null);
      return;
    }
    const min = xScale.invert(domain.x0);
    const max = xScale.invert(domain.x1);
    setVelocityFilter({ min, max });
  };

  if (velocities.length === 0) {
    return <div style={{ color: '#ccc', padding: '20px' }}>Loading...</div>;
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg width={width} height={height}>
      <Group left={margin.left} top={margin.top}>
        {bins.map((bin, i) => (
          <Bar
            key={i}
            x={xScale(bin.x)}
            y={yScale(bin.count)}
            width={Math.max(1, xScale(bin.x + binWidth) - xScale(bin.x) - 1)}
            height={yMax - yScale(bin.count)}
            fill="#4A90E2"
            opacity={0.8}
          />
        ))}
        
        <Brush
          xScale={xScale}
          yScale={yScale}
          width={xMax}
          height={yMax}
          margin={margin}
          handleSize={8}
          resizeTriggerAreas={['left', 'right']}
          brushDirection="horizontal"
          onChange={onBrushChange}
          selectedBoxStyle={{ fill: 'rgba(255,255,255,0.1)', stroke: '#fff' }}
        />
        
        <AxisBottom
          top={yMax}
          scale={xScale}
          numTicks={5}
          stroke="#666"
          tickStroke="#666"
          tickLabelProps={{
            fill: "#ccc",
            fontSize: 10,
            textAnchor: "middle",
          }}
          label="Velocity (km/s)"
          labelProps={{
            fill: "#ccc",
            fontSize: 12,
            textAnchor: "middle",
          }}
        />
        <AxisLeft
          scale={yScale}
          numTicks={4}
          stroke="#666"
          tickStroke="#666"
          tickLabelProps={{
            fill: "#ccc",
            fontSize: 10,
            textAnchor: "end",
            dx: -5,
          }}
          label="Count"
          labelProps={{
            fill: "#ccc",
            fontSize: 12,
            textAnchor: "middle",
            dy: -30,
          }}
        />
      </Group>
      </svg>
    </div>
  );
};

