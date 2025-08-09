import { Box, Grid } from "@chakra-ui/react";
import React, { useEffect, useState } from "react";
import GLScatter from "../../components/GLScatter";
import { interpolateTurbo } from "d3-scale-chromatic";
import { rgb } from "d3-color";

export const AstroDemo: React.FC = () => {
  const [positions, setPositions] = useState<Float32Array | null>(null);
  const [colors, setColors] = useState<Float32Array | null>(null);

  useEffect(() => {
    fetch("/mock_rsd.csv")
      .then((r) => r.text())
      .then((text) => {
        const lines = text.trim().split("\n");
        lines.shift(); // header
        const n = lines.length;
        const pts = new Float32Array(n * 2);
        const cols = new Float32Array(n * 3);
        const sPerp: number[] = [];
        const sPar: number[] = [];
        const vpars: number[] = [];
        const rows = lines.map((l) => l.split(",").map(Number));
        rows.forEach(([, , , vpar, , sx, sy, sz]) => {
          sPerp.push(Math.sqrt(sx * sx + sy * sy));
          sPar.push(sz);
          vpars.push(vpar);
        });
        const xMin = Math.min(...sPerp);
        const xMax = Math.max(...sPerp);
        const yMin = Math.min(...sPar);
        const yMax = Math.max(...sPar);
        const vMin = Math.min(...vpars);
        const vMax = Math.max(...vpars);
        rows.forEach(([, , , vpar], i) => {
          const sp = sPerp[i];
          const sp2 = sPar[i];
          pts[2 * i] = ((sp - xMin) / (xMax - xMin)) * 2 - 1;
          pts[2 * i + 1] = ((sp2 - yMin) / (yMax - yMin)) * 2 - 1;
          const t = (vpar - vMin) / (vMax - vMin);
          const c = rgb(interpolateTurbo(t));
          cols[3 * i] = c.r / 255;
          cols[3 * i + 1] = c.g / 255;
          cols[3 * i + 2] = c.b / 255;
        });
        setPositions(pts);
        setColors(cols);
      });
  }, []);

  return (
    <Box bg="#111" color="#ccc" h="100vh" p={2}>
      <Grid templateColumns="1fr 1fr" templateRows="1fr 1fr" gap={2} h="100%">
        <Box bg="#111" border="1px solid #333">
          {positions && colors && (
            <GLScatter positions={positions} colors={colors} pointSize={2} />
          )}
        </Box>
        <Box bg="#111" border="1px solid #333"></Box>
        <Box bg="#111" border="1px solid #333"></Box>
        <Box bg="#111" border="1px solid #333"></Box>
      </Grid>
    </Box>
  );
};

export default AstroDemo;
