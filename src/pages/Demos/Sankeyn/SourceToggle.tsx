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
    <Flex gap={2} wrap="wrap" align="stretch">
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
              whiteSpace="nowrap"
            >
              {SOURCES[key].label}
            </Text>
            <Text fontSize="xs" color="fg.muted" mt={1} whiteSpace="nowrap">
              {SOURCES[key].blurb}
            </Text>
          </Box>
        );
      })}
    </Flex>
  );
}
