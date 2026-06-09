import { Box, HStack, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import {
  CATEGORY_LABELS,
  OUTCOME_ORDER,
  categoryToken,
  outcomeToken,
} from "../TrajectoryAtlas/taxonomy";
import { legendCategoriesAtom } from "./atoms";

function Chip({ token, label }: { token: string; label: string }) {
  return (
    <HStack gap={1.5}>
      <Box w="10px" h="10px" borderRadius="sm" bg={token} />
      <Text>{label}</Text>
    </HStack>
  );
}

export function Legend() {
  const categories = useAtomValue(legendCategoriesAtom);

  return (
    <HStack flexWrap="wrap" gap={3} fontSize="xs" color="fg.muted">
      {categories.map((cat) => (
        <Chip key={cat} token={categoryToken(cat)} label={CATEGORY_LABELS[cat]} />
      ))}
      <Box w="1px" alignSelf="stretch" bg="gray.subtle" />
      {OUTCOME_ORDER.map((o) => (
        <Chip key={o} token={outcomeToken(o)} label={o} />
      ))}
    </HStack>
  );
}
