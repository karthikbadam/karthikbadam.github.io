import { Box, Text } from "@chakra-ui/react";
import { useCallback, useRef, useEffect, useState } from "react";
import * as vg from "@uwdata/vgplot";
import { useGravitationalLensing } from "../../../contexts/GravitationalLensingContext";

export function LensedGrid() {
  const { state, isComputing } = useGravitationalLensing();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Track container dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setDimensions((prev) => {
          if (prev.width !== width || prev.height !== height) {
            return { width, height };
          }
          return prev;
        });
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const buildChart = useCallback(() => {
    if (state.status !== "ready" || dimensions.width === 0) return null;

    // Create Mosaic params for toggles
    const $mesh = vg.Param.value(0);
    const $showBeta = vg.Param.value(1);

    // Use downsampled view (every 10th point = 200x200 = 40,000 points)
    const downsampledSource = vg.sql`(SELECT * FROM lensed_grid WHERE ix % 10 = 0 AND iy % 10 = 0)`;

    return vg.vconcat(
      vg.hconcat(
        vg.menu({
          label: "View: ",
          options: [
            { value: 0, label: "Theta plane (original)" },
            { value: 1, label: "Beta plane (lensed)" },
          ],
          as: $showBeta,
        }),
        vg.hspace(10),
        vg.menu({
          label: "Delaunay Mesh: ",
          options: [
            { value: 0, label: "Hide" },
            { value: 0.2, label: "Show" },
          ],
          as: $mesh,
        })
      ),
      vg.vspace(10),
      vg.plot(
        // Delaunay mesh overlay
        vg.delaunayMesh(vg.from(downsampledSource), {
          x: vg.sql`CASE WHEN ${$showBeta} = 1 THEN beta_x ELSE theta_x END`,
          y: vg.sql`CASE WHEN ${$showBeta} = 1 THEN beta_y ELSE theta_y END`,
          strokeOpacity: $mesh,
          strokeWidth: 0.5,
        }),
        // Raw points
        vg.raster(vg.from('lensed_grid'), {
          x: vg.sql`CASE WHEN ${$showBeta} = 1 THEN beta_x ELSE theta_x END`,
          y: vg.sql`CASE WHEN ${$showBeta} = 1 THEN beta_y ELSE theta_y END`,
          bandwidth: 0,
          fill: 'steelblue'
        }),
        // vg.dot(vg.from(downsampledSource), {
        //   x: vg.sql`CASE WHEN ${$showBeta} = 1 THEN beta_x ELSE theta_x END`,
        //   y: vg.sql`CASE WHEN ${$showBeta} = 1 THEN beta_y ELSE theta_y END`,
        //   r: 1,
        //   fillOpacity: 0.5,
        // }),
        vg.xDomain([-1, 1]),
        vg.yDomain([-1, 1]),
        vg.xAxis(null),
        vg.yAxis(null),
        vg.aspectRatio(1),
        vg.marginLeft(10),
        vg.marginRight(10),
        vg.marginTop(10),
        vg.marginBottom(10),
        vg.width(dimensions.width),
        vg.height(dimensions.height - 50),
      )
    );
  }, [dimensions]);

  useEffect(() => {
    if (!containerRef.current || state.status !== "ready") return;

    const chart = buildChart();
    if (chart) {
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(chart);
    }
  }, [buildChart, isComputing, state.status]);

  if (state.status !== "ready") {
    return (
      <Box
        bg="bg.panel"
        borderRadius="lg"
        p={3}
        h="100%"
        border="1px solid"
        borderColor="gray.subtle"
      >
        <Text fontSize="sm" color="fg.muted">
          Loading...
        </Text>
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
    >
      <Text fontSize="xs" fontWeight="semibold" color="accentSubtle" mb={1}>
        Lensed Grid
        <Text as="span" fontWeight="normal" color="fg.muted" ml={1}>
          (2000 x 2000 points)
        </Text>
      </Text>
      <Box ref={containerRef} flex="1" minH="300px" overflow="hidden" />
    </Box>
  );
}
