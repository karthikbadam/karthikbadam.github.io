// Trajectory Atlas — OutcomeSankey. Thin wrapper around SankeyMosaicClient
// that supplies the entry/dominant/outcome columns, the Observable10
// per-category palette, and a stable success/partial/fail ordering.

import { SankeyMosaicClient, type SankeyColumnSpec } from "../../../components/SankeyMosaicClient";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import {
  ACTION_ORDER,
  CAT_COLOR,
  OUTCOME_COLOR,
  OUTCOME_ORDER,
} from "./taxonomy";
import type { Category, Outcome } from "./types";

const COLUMNS: SankeyColumnSpec[] = [
  {
    name: "entry",
    label: "Entry action",
    // First non-plan category in the trajectory: arg_min picks `category` at
    // the row with the smallest `step_idx` (after the FILTER applies).
    expr: "arg_min(category, step_idx) FILTER (WHERE category != 'plan')",
  },
  {
    name: "dominant",
    label: "Dominant action",
    // Most-used category outside plan/submit/error. MODE returns the modal
    // value of the column (DuckDB).
    expr: "mode(category) FILTER (WHERE category NOT IN ('plan','submit','error'))",
  },
  {
    name: "outcome",
    label: "Outcome",
    // Trajectory-level outcome — same for every step row of the same traj_id.
    expr: "any_value(outcome)",
  },
];

function paletteFor(column: string, value: string): string {
  if (column === "outcome") return OUTCOME_COLOR[value as Outcome] ?? "var(--ta-fg-subtle)";
  return CAT_COLOR[value as Category] ?? "var(--ta-fg-subtle)";
}

const ORDERINGS = {
  entry: ACTION_ORDER as readonly string[] as string[],
  dominant: ACTION_ORDER as readonly string[] as string[],
  outcome: OUTCOME_ORDER as readonly string[] as string[],
};

export function OutcomeSankey() {
  const { coordinator, crossfilter } = useTrajectoryAtlas();
  if (!coordinator) return <div className="ta-viz-root" />;
  return (
    <SankeyMosaicClient
      coordinator={coordinator}
      table="steps"
      idCol="traj_id"
      columns={COLUMNS}
      selection={crossfilter}
      palette={paletteFor}
      orderings={ORDERINGS}
    />
  );
}
