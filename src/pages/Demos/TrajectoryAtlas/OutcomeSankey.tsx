// Trajectory Atlas — OutcomeSankey. Thin wrapper around SankeyMosaicClient
// that supplies the entry-tool / dominant-tool / outcome columns and the
// Observable10 per-category palette (resolved via the step's category bucket).

import { useColorMode } from "../../../components/ui/color-mode";
import { SankeyMosaicClient, type SankeyColumnSpec } from "../../../components/SankeyMosaicClient";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { CAT_COLOR, OUTCOME_COLOR, OUTCOME_ORDER, categoryFor } from "./taxonomy";
import type { Category, Outcome } from "./types";

// Each row in the `steps` table is one message. We aggregate per traj_id:
//   entry_tool    = first tool-call name in the trajectory
//   dominant_tool = most-used tool-call name (excluding meta steps)
//   outcome       = trajectory outcome (same for every row of a trajectory)
//
// We deliberately exclude `task`, `observation`, and `thought` from the
// "tool" computations because those are meta-steps describing the
// conversation structure rather than agent actions.
const META_NAMES = "('task','observation','thought','think','thinking')";

const COLUMNS: SankeyColumnSpec[] = [
  {
    name: "entry",
    label: "Entry tool",
    expr: `arg_min(name, step_idx) FILTER (WHERE name NOT IN ${META_NAMES})`,
  },
  {
    name: "dominant",
    label: "Dominant tool",
    expr: `mode(name) FILTER (WHERE name NOT IN ${META_NAMES})`,
  },
  {
    name: "outcome",
    label: "Outcome",
    expr: "any_value(outcome)",
  },
];

function paletteFor(column: string, value: string): string {
  if (column === "outcome") return OUTCOME_COLOR[value as Outcome] ?? "var(--chakra-colors-fg-subtle)";
  // Map the actual tool name → its category bucket → Observable10 hue.
  const cat = categoryFor(value) as Category;
  return CAT_COLOR[cat] ?? "var(--chakra-colors-fg-subtle)";
}

const ORDERINGS = {
  outcome: OUTCOME_ORDER as readonly string[] as string[],
};

export function OutcomeSankey() {
  const { coordinator, crossfilter } = useTrajectoryAtlas();
  const { colorMode } = useColorMode();
  if (!coordinator) return null;
  return (
    <SankeyMosaicClient
      coordinator={coordinator}
      table="steps"
      idCol="traj_id"
      columns={COLUMNS}
      selection={crossfilter}
      palette={paletteFor}
      orderings={ORDERINGS}
      dark={colorMode === "dark"}
    />
  );
}
