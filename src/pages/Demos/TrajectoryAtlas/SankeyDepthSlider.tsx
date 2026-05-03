// SankeyDepthSlider — controls how many sequential tool-step columns the
// sankey renders before the outcome column. Bound on the parquet's
// pre-computed step_1..step_N range (see TrajectoryAtlasContext.maxSankeyDepth).

import { Flex, Slider, Text } from "@chakra-ui/react";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";

export function SankeyDepthSlider() {
  const { sankeyDepth, setSankeyDepth, maxSankeyDepth } = useTrajectoryAtlas();
  return (
    <Flex align="center" gap={2} flexShrink={0}>
      <Text fontSize="xs" color="fg.muted" textTransform="uppercase" letterSpacing="0.04em">
        depth
      </Text>
      <Slider.Root
        value={[sankeyDepth]}
        onValueChange={(d) => setSankeyDepth(d.value[0])}
        min={1}
        max={maxSankeyDepth}
        step={1}
        width="120px"
        size="sm"
      >
        <Slider.Control>
          <Slider.Track>
            <Slider.Range />
          </Slider.Track>
          <Slider.Thumbs />
        </Slider.Control>
      </Slider.Root>
      <Text fontSize="xs" color="fg.muted" fontFamily="mono" minW="2ch" textAlign="right">
        {sankeyDepth}
      </Text>
    </Flex>
  );
}
