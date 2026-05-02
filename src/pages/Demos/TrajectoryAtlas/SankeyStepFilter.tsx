// SankeyStepFilter — toggle chips that let the user choose which meta-step
// or tool names are excluded from the sankey's tool columns.
// Active chip (filled) = step is HIDDEN from the sankey.
// Inactive chip (outlined) = step is shown.

import { Box, Button, HStack, Text } from "@chakra-ui/react";
import { useColorMode } from "../../../components/ui/color-mode";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";

const META_STEPS = ["task", "thought", "observation", "finish", "final_answer"];

export function SankeyStepFilter() {
  const { hiddenStepNames, toggleHiddenStep } = useTrajectoryAtlas();
  const { colorMode } = useColorMode();
  const dark = colorMode === "dark";

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
              onClick={() => toggleHiddenStep(name)}
              fontFamily="mono"
              fontSize="10px"
              px={2}
              h={6}
              minW="auto"
              fontWeight="medium"
              bg={hidden ? "accent" : "transparent"}
              color={hidden ? (dark ? "bg.panel" : "white") : "fg.muted"}
              borderWidth="1px"
              borderColor={hidden ? "accent" : "gray.subtle"}
              borderStyle="solid"
              _hover={{
                bg: hidden ? "accent" : "bg.subtle",
                color: hidden ? (dark ? "bg.panel" : "white") : "fg",
                borderColor: hidden ? "accent" : "gray.muted",
              }}
            >
              {name}
            </Button>
          );
        })}
      </Box>
    </HStack>
  );
}
