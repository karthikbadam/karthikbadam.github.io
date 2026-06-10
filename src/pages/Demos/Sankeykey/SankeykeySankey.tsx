// Sankeykey — hero sankey. Same column recipe as the Trajectory Atlas
// OutcomeSankey (step_1..step_K + outcome), but standalone: no crossfilter,
// since there are no sibling panels to drive. Ribbon clicks still highlight
// locally inside SankeyMosaicClient.

import { useMemo } from "react";
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
import { OUTCOME_ORDER, categoryFor, categoryHex } from "../TrajectoryAtlas/taxonomy";
import type { Outcome } from "../TrajectoryAtlas/types";
import { outcomeColor } from "./outcomeColors";

// Outcome order reversed vs the shared OUTCOME_ORDER: with top-aligned
// columns, dropoff skip-edges travel the bottom gutter, so success sits at
// the bottom of the outcome column where the gutter lands without crossing.
const ORDERINGS = {
  outcome: [...OUTCOME_ORDER].reverse() as string[],
};

const stepLabel = (i: number): string => {
  if (i === 0) return "Entry tool";
  if (i === 1) return "2nd tool";
  if (i === 2) return "3rd tool";
  return `${i + 1}th tool`;
};

export function SankeykeySankey() {
  const coordinator = useAtomValue(coordinatorAtom);
  const depth = useAtomValue(depthAtom);
  const resetSignal = useAtomValue(resetSignalAtom);
  const setSankeyActive = useSetAtom(sankeyActiveAtom);
  const { colorMode } = useColorMode();
  const dark = colorMode === "dark";

  const columns: SankeyColumnSpec[] = useMemo(
    () => [
      ...Array.from({ length: depth }, (_, i) => ({
        name: `step_${i + 1}`,
        label: stepLabel(i),
        expr: `any_value(step_${i + 1})`,
      })),
      { name: "outcome", label: "Outcome", expr: "any_value(outcome)" },
    ],
    [depth],
  );

  const palette = useMemo(
    () => (column: string, value: string): string => {
      if (column === "outcome") return outcomeColor(value as Outcome, dark);
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
      align="top"
      dropoffLabels
      nodeOrder="barycenter"
      resetSignal={resetSignal}
      onSelectionStateChange={setSankeyActive}
    />
  );
}
