// IcicleStepFilter — toggle chips that let the user choose which meta-steps
// (task, thought, observation, ...) are hidden from the icicle's path tree.
//
// Active chip = step is HIDDEN from the chart. Click to toggle.

import { Box, Button, HStack, Text } from "@chakra-ui/react";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";

const META_STEPS = ["task", "thought", "observation", "finish"];

export function IcicleStepFilter() {
  const { hiddenStepNames, toggleHiddenStep } = useTrajectoryAtlas();

  return (
    <HStack gap={1.5} flexShrink={0}>
      <Text fontSize="10px" color="fg.muted" textTransform="uppercase" letterSpacing="0.04em">
        hide
      </Text>
      <Box display="flex" gap={1}>
        {META_STEPS.map((name) => {
          const hidden = hiddenStepNames.has(name);
          return (
            <Button
              key={name}
              size="xs"
              variant={hidden ? "solid" : "outline"}
              colorPalette="gray"
              onClick={() => toggleHiddenStep(name)}
              fontFamily="mono"
              fontSize="10px"
              px={2}
              h={6}
              minW="auto"
              fontWeight="medium"
              opacity={hidden ? 1 : 0.6}
            >
              {name}
            </Button>
          );
        })}
      </Box>
    </HStack>
  );
}
