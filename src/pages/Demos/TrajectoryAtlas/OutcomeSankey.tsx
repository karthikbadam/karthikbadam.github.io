// Trajectory Atlas — OutcomeSankey. Pulls per-trajectory aggregates from the
// `traj_summary` table the context built at load time:
//   entry_tool   — first non-meta tool the trajectory invokes
//   dominant_1   — most-used tool overall
//   dominant_2   — second-most-used tool (null when the trajectory only ever
//                  uses one tool)
//   outcome      — success / partial / fail
//
// Each column's `expr` is `any_value(col)` because traj_summary is already
// one-row-per-id; the aggregation is a no-op needed only to satisfy the
// SankeyMosaicClient's GROUP BY id pipeline.

import { useColorMode } from "../../../components/ui/color-mode";
import { SankeyMosaicClient, type SankeyColumnSpec } from "../../../components/SankeyMosaicClient";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { OUTCOME_ORDER, categoryFor, categoryHex, outcomeHex } from "./taxonomy";
import type { Category, Outcome } from "./types";

const COLUMNS: SankeyColumnSpec[] = [
  { name: "entry", label: "Entry tool", expr: "any_value(entry_tool)" },
  { name: "dominant_1", label: "1st dominant", expr: "any_value(dominant_1)" },
  { name: "dominant_2", label: "2nd dominant", expr: "any_value(dominant_2)" },
  { name: "outcome", label: "Outcome", expr: "any_value(outcome)" },
];

const ORDERINGS = {
  outcome: OUTCOME_ORDER as readonly string[] as string[],
};

export function OutcomeSankey() {
  const { coordinator, crossfilter } = useTrajectoryAtlas();
  const { colorMode } = useColorMode();
  const dark = colorMode === "dark";

  if (!coordinator) return null;

  const palette = (column: string, value: string): string => {
    if (column === "outcome") return outcomeHex(value as Outcome, dark);
    const cat = categoryFor(value) as Category;
    return categoryHex(cat, dark);
  };

  return (
    <SankeyMosaicClient
      coordinator={coordinator}
      table="traj_summary"
      idCol="id"
      columns={COLUMNS}
      selection={crossfilter}
      palette={palette}
      orderings={ORDERINGS}
      dark={dark}
      maxNodesPerColumn={11}
    />
  );
}
