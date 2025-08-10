import React from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Circle, Line } from "@visx/shape";
import { Brush } from "@visx/brush";
import { Bounds } from "@visx/brush/lib/types";
import { astroDataAtom, redshiftFilterAtom } from "../stores/astroStore";

export const RedshiftComparison: React.FC = () => {
  const astroData = useAtomValue(astroDataAtom);
  const setRedshiftFilter = useSetAtom(redshiftFilterAtom);
  
  const data = astroData instanceof Promise ? [] : astroData.dataPoints;
  const zc = data.map(d => d.zc);
  const zobs = data.map(d => d.zobs);
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

  const minZ = Math.min(...zc, ...zobs);
  const maxZ = Math.max(...zc, ...zobs);

  // Scales
  const xScale = scaleLinear({
    range: [0, xMax],
    domain: [minZ, maxZ],
  });

  const yScale = scaleLinear({
    range: [yMax, 0],
    domain: [minZ, maxZ],
  });

  const onBrushChange = (domain: Bounds | null) => {
    if (!domain) {
      setRedshiftFilter(null);
      return;
    }
    const min = xScale.invert(domain.x0);
    const max = xScale.invert(domain.x1);
    setRedshiftFilter({ min, max });
  };

  if (data.length === 0) {
    return <div style={{ color: '#ccc', padding: '20px' }}>Loading...</div>;
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg width={width} height={height}>
      <Group left={margin.left} top={margin.top}>
        {/* 1:1 line */}
        <Line
          from={{ x: xScale(minZ), y: yScale(minZ) }}
          to={{ x: xScale(maxZ), y: yScale(maxZ) }}
          stroke="#666"
          strokeWidth={1}
          strokeDasharray="3,3"
        />
        
        {/* Data points */}
        {zc.map((zcVal, i) => (
          <Circle
            key={i}
            cx={xScale(zcVal)}
            cy={yScale(zobs[i])}
            r={1.5}
            fill="#E94B3C"
            opacity={0.6}
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
          numTicks={4}
          stroke="#666"
          tickStroke="#666"
          tickLabelProps={{
            fill: "#ccc",
            fontSize: 10,
            textAnchor: "middle",
          }}
          label="z_cosmological"
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
          label="z_observed"
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

