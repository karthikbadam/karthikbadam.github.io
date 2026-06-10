// Sankeyn — hero sankey. Same column recipe as the Trajectory Atlas
// OutcomeSankey (step_1..step_K + outcome), but standalone: no crossfilter,
// since there are no sibling panels to drive. Ribbon clicks still highlight
// locally inside SankeyMosaicClient.

import { useEffect, useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useColorMode } from "../../../components/ui/color-mode";
import {
  SankeyMosaicClient,
  type SankeyColumnSpec,
} from "../../../components/SankeyMosaicClient";
import {
  coordinatorAtom,
  depthAtom,
  resetSignalAtom,
  sankeyActiveAtom,
} from "./atoms";
import {
  OUTCOME_ORDER,
  categoryFor,
  categoryHex,
  outcomeHex,
  stepLabel,
} from "../../../components/taxonomy";
import type { Outcome } from "../../../components/taxonomy";

const ORDERINGS: Record<string, string[]> = {
  outcome: [...OUTCOME_ORDER],
};

export function SankeynSankey() {
  const coordinator = useAtomValue(coordinatorAtom);
  const depth = useAtomValue(depthAtom);
  const resetSignal = useAtomValue(resetSignalAtom);
  const setSankeyActive = useSetAtom(sankeyActiveAtom);
  const { colorMode } = useColorMode();
  const dark = colorMode === "dark";

  const [renderDepth, setRenderDepth] = useState(depth);
  useEffect(() => {
    const id = setTimeout(() => setRenderDepth(depth), 150);
    return () => clearTimeout(id);
  }, [depth]);

  const columns: SankeyColumnSpec[] = useMemo(
    () => [
      ...Array.from({ length: renderDepth }, (_, i) => ({
        name: `step_${i + 1}`,
        label: stepLabel(i, renderDepth > 5),
        expr: `any_value(step_${i + 1})`,
      })),
      { name: "outcome", label: "Outcome", expr: "any_value(outcome)" },
    ],
    [renderDepth],
  );

  const palette = useMemo(
    () => (column: string, value: string): string => {
      if (column === "outcome") return outcomeHex(value as Outcome, dark);
      if (value === "(none)") return dark ? "#4a5568" : "#a0aec0";
      return categoryHex(categoryFor(value), dark);
    },
    [dark],
  );

  if (!coordinator) return null;

  return (
    <SankeyMosaicClient
      coordinator={coordinator}
      table="trajectories"
      idCol="id"
      columns={columns}
      selection={null}
      palette={palette}
      orderings={ORDERINGS}
      dark={dark}
      maxNodesPerColumn={11}
      align="bottom"
      dropoffLabels
      nodeOrder="barycenter"
      resetSignal={resetSignal}
      onSelectionStateChange={setSankeyActive}
    />
  );
}
