// Inline coloured-dot rendering of a trajectory's step sequence — used by
// the trajectory table's Path column. Plain Chakra components, no CSS file.

import { Box, Flex, Text } from "@chakra-ui/react";
import { categoryFor, categoryToken } from "./taxonomy";

interface StepPathProps {
  /** Comma-joined string of step names, e.g. "task,thought,web_search,…" */
  value: string | null | undefined;
  /** Hard cap on rendered dots; a "+N" pill caps the rest. */
  max?: number;
}

export function StepPath({ value, max = 24 }: StepPathProps) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const names = raw.split(",");
  const shown = names.slice(0, max);
  const more = names.length - shown.length;
  return (
    <Flex align="center" gap="2px" overflow="hidden" flexWrap="nowrap">
      {shown.map((name, i) => (
        <Box
          key={i}
          w="10px"
          h="10px"
          borderRadius="2px"
          flexShrink={0}
          bg={categoryToken(categoryFor(name))}
          title={`${i + 1}. ${name}`}
        />
      ))}
      {more > 0 && (
        <Text as="span" fontFamily="mono" fontSize="11px" color="fg.subtle" ml={1}>
          +{more}
        </Text>
      )}
    </Flex>
  );
}
