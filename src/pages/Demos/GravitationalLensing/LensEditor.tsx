import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../components/MosaicChart";
import { useGravitationalLensing } from "../../../contexts/GravitationalLensingContext";

export function LensEditor() {
  const { state, addLens, removeLastLens, isComputing } = useGravitationalLensing();

  const build = useCallback(
    (_: void, { width, height }: ChartDimensions) => {
      return vg.plot(
        vg.dot(vg.from("lenses"), {
          x: "cx",
          y: "cy",
          r: vg.sql`e * 80`,
          fill: "steelblue",
          fillOpacity: 0.6,
          stroke: "steelblue",
          strokeWidth: 2,
          tip: true,
        }),
        vg.xLabel("cx (horizontal position)"),
        vg.yLabel("cy (vertical position)"),
        vg.xDomain([-1, 1]),
        vg.yDomain([-1, 1]),
        vg.aspectRatio(1),
        vg.marginLeft(40),
        vg.marginRight(20),
        vg.marginTop(40),
        vg.marginBottom(40),
        vg.width(width),
        vg.height(height)
      );
    },
    []
  );

  const handleAddLens = () => {
    // Add a new lens at a random position
    const cx = (Math.random() - 0.5) * 1.5;
    const cy = (Math.random() - 0.5) * 1.5;
    const e = 0.1 + Math.random() * 0.2;
    addLens(cx, cy, e);
  };

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
        Lens Editor
      </Text>

      <Box flex="1" minH="200px">
        <MosaicChart
          title=""
          build={build}
          dependencies={[isComputing]}
          isReady={state.status === "ready"}
        />
      </Box>

      <VStack gap={2} mt={2} align="stretch">
        <HStack gap={2}>
          <Button
            size="xs"
            colorPalette="blue"
            onClick={handleAddLens}
            disabled={isComputing}
            flex={1}
          >
            Add Lens
          </Button>
          <Button
            size="xs"
            colorPalette="red"
            variant="outline"
            onClick={removeLastLens}
            disabled={isComputing}
            flex={1}
          >
            Remove Last
          </Button>
        </HStack>
        <Text fontSize="xs" color="fg.muted" textAlign="center">
          Marker size indicates Einstein radius (e)
        </Text>
      </VStack>
    </Box>
  );
}

