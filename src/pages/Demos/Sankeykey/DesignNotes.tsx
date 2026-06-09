// Sankeykey — annotated notes on the design decisions behind the sankey.

import { Box, Heading, SimpleGrid, Text } from "@chakra-ui/react";
import { Legend } from "./Legend";

function Note({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box p={4} borderWidth="1px" borderRadius="lg" fontSize="sm">
      <Heading size="md" color="accent" mb={2}>
        {title}
      </Heading>
      {children}
    </Box>
  );
}

export function DesignNotes() {
  return (
    <Box mt={4}>
      <Heading size="lg" color="accent" mb={3}>
        Why it works
      </Heading>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
        <Note title="Progressive disclosure">
          <Text color="fg.muted">
            The slider doesn't filter a pre-built picture — it rebuilds the
            chart's column spec. Each depth adds a <code>step_k</code> column,
            and the sankey re-issues its node and link GROUP BY queries against
            DuckDB-WASM right in the browser. No precomputed layouts; the
            aggregation is live, so a depth-8 view is exactly as truthful as a
            depth-1 view.
          </Text>
        </Note>
        <Note title="Skip-edges for short rollouts">
          <Text color="fg.muted">
            A rollout that finishes after two tool calls has nothing to say in
            column five. Instead of stacking fake "(none)" nodes, its ribbon
            skips past the empty columns and routes straight to the outcome.
            Deep columns stay honest — they only show rollouts that actually
            got that far.
          </Text>
        </Note>
        <Note title="Long-tail collapsing">
          <Text color="fg.muted">
            Each column keeps its top tools and folds the rest into a single
            "other (N)" node, with links re-routed and merged. Crowded steps
            stay readable without hiding that a tail exists.
          </Text>
        </Note>
        <Note title="Semantic color taxonomy">
          <Text color="fg.muted" mb={3}>
            Tool names map to a small set of categories (execute, edit, search,
            verify, …) via pattern rules, and each category maps to one theme
            palette color — dark-mode aware. Color answers "what kind of
            action", so the eye can track behavior across columns even as the
            specific tools change.
          </Text>
          <Legend />
        </Note>
        <Note title="Hand-rolled ribbons">
          <Text color="fg.muted">
            No d3-sankey: layout is a small custom pass, and each ribbon is one
            cubic-bezier path drawn with Visx primitives. Owning the layout is
            what makes skip-edges and the live column count cheap to support.
          </Text>
        </Note>
      </SimpleGrid>
    </Box>
  );
}
