// San(key)ⁿ dataset selector: one card per dataset with a short description.
// Selecting swaps the live DuckDB table; the chart remounts on the new source
// (see loadedSourceAtom).

import { Box, Flex, Text } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { SOURCES, loadedSourceAtom, switchSourceAtom, type SourceKey } from "./atoms";

const SOURCE_KEYS = Object.keys(SOURCES) as SourceKey[];

export function SourceToggle() {
  const loadedSource = useAtomValue(loadedSourceAtom);
  const switchSource = useSetAtom(switchSourceAtom);

  return (
    <Box textAlign="center">
      <Flex gap={2} wrap="wrap" justify="center">
        {SOURCE_KEYS.map((key) => {
          const active = key === loadedSource;
          return (
            <Box
              as="button"
              key={key}
              onClick={() => switchSource(key)}
              textAlign="left"
              px={3}
              py={2}
              maxW="220px"
              borderRadius="md"
              borderWidth="1px"
              borderColor={active ? "accent" : "gray.subtle"}
              bg={active ? "accentBackground" : "bg"}
              cursor="pointer"
              transition="border-color .15s, background .15s"
              _hover={{ borderColor: "accent" }}
            >
              <Text
                fontSize="sm"
                fontWeight="semibold"
                color={active ? "accent" : "fg"}
              >
                {SOURCES[key].label}
              </Text>
              <Text fontSize="xs" color="fg.muted" mt={1} lineHeight="1.35">
                {SOURCES[key].blurb}
              </Text>
            </Box>
          );
        })}
      </Flex>
    </Box>
  );
}
