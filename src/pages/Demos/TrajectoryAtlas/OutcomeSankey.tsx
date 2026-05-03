// Trajectory Atlas — OutcomeSankey. Renders the slider-controlled
// step_1..step_K columns alongside the outcome column. The step_i values
// are pre-computed in the parquet (see public/scripts/extract_trajectories.py).

import { useMemo } from "react";
import { useColorMode } from "../../../components/ui/color-mode";
import { SankeyMosaicClient, type SankeyColumnSpec } from "../../../components/SankeyMosaicClient";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { OUTCOME_ORDER, categoryFor, categoryHex, outcomeHex } from "./taxonomy";
import type { Category, Outcome } from "./types";

const ORDERINGS = { outcome: OUTCOME_ORDER as readonly string[] as string[] };

const stepLabel = (i: number): string => {
  if (i === 0) return "Entry tool";
  if (i === 1) return "2nd tool";
  if (i === 2) return "3rd tool";
  return `${i + 1}th tool`;
};

export function OutcomeSankey() {
  const { coordinator, crossfilter, highlightedTrajId, sankeyDepth } =
    useTrajectoryAtlas();
  const { colorMode } = useColorMode();
  const dark = colorMode === "dark";

  const columns: SankeyColumnSpec[] = useMemo(
    () => [
      ...Array.from({ length: sankeyDepth }, (_, i) => ({
        name: `step_${i + 1}`,
        label: stepLabel(i),
        expr: `any_value(step_${i + 1})`,
      })),
      { name: "outcome", label: "Outcome", expr: "any_value(outcome)" },
    ],
    [sankeyDepth],
  );

  const palette = useMemo(
    () => (column: string, value: string): string => {
      if (column === "outcome") return outcomeHex(value as Outcome, dark);
      if (value === "(none)") return dark ? "#4a5568" : "#a0aec0";
      return categoryHex(categoryFor(value) as Category, dark);
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
      selection={crossfilter}
      palette={palette}
      orderings={ORDERINGS}
      dark={dark}
      maxNodesPerColumn={11}
      highlightedTrajIds={highlightedTrajId ? new Set([highlightedTrajId]) : null}
    />
  );
}
