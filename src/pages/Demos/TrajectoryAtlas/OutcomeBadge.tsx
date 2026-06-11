// Outcome pill — success / partial / fail — coloured via Chakra's chart
// semantic tokens. The translucent background uses CSS `color-mix` against
// the same token so the badge stays cohesive with the rest of the demo.

import { Box } from "@chakra-ui/react";
import { outcomeToken } from "../../../components/taxonomy";
import type { Outcome } from "./types";

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const token = outcomeToken(outcome);
  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      fontSize="10px"
      fontWeight="medium"
      textTransform="uppercase"
      letterSpacing="0.05em"
      px={2}
      py="2px"
      borderRadius="full"
      color={token}
      bg={`color-mix(in oklab, var(--chakra-colors-${token.replace(".", "-")}) 18%, transparent)`}
    >
      {outcome}
    </Box>
  );
}
