// Trajectory Atlas — OutcomeSankey. Thin wrapper around SankeyMosaicClient
// that supplies the entry-tool / dominant-tool / outcome columns and the
// Observable10 per-category palette resolved to concrete hex (avoids CSS-var
// resolution flakiness inside the SVG render path).
//
// The user-controllable chip filter (rendered in the panel header by the
// Dashboard) drives `hiddenStepNames` from the context; we forward it as
// a SQL WHERE clause so the sankey ignores those step names entirely.

import { useMemo } from "react";
import { useColorMode } from "../../../components/ui/color-mode";
import { SankeyMosaicClient, type SankeyColumnSpec } from "../../../components/SankeyMosaicClient";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { OUTCOME_ORDER, categoryFor, categoryHex, outcomeHex } from "./taxonomy";
import type { Category, Outcome } from "./types";

const COLUMNS: SankeyColumnSpec[] = [
  {
    name: "entry",
    label: "Entry tool",
    expr: "arg_min(name, step_idx)",
  },
  {
    name: "dominant",
    label: "Dominant tool",
    expr: "mode(name)",
  },
  {
    name: "outcome",
    label: "Outcome",
    expr: "any_value(outcome)",
  },
];

const ORDERINGS = {
  outcome: OUTCOME_ORDER as readonly string[] as string[],
};

export function OutcomeSankey() {
  const { coordinator, crossfilter, hiddenStepNames } = useTrajectoryAtlas();
  const { colorMode } = useColorMode();
  const dark = colorMode === "dark";

  // The list of names hidden from the sankey is whatever the user has chosen
  // via the chip filter — defaults seeded by the context to task/thought/observation.
  const hiddenList = Array.from(hiddenStepNames);
  const whereExpr = useMemo(() => {
    if (!hiddenList.length) return null;
    const list = hiddenList.map((n) => `'${n.replace(/'/g, "''")}'`).join(",");
    return `name NOT IN (${list})`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenList.join("|")]);

  const palette = useMemo(
    () =>
      (column: string, value: string): string => {
        if (column === "outcome") return outcomeHex(value as Outcome, dark);
        const cat = categoryFor(value) as Category;
        return categoryHex(cat, dark);
      },
    [dark],
  );

  if (!coordinator) return null;

  return (
    <SankeyMosaicClient
      coordinator={coordinator}
      table="steps"
      idCol="id"
      columns={COLUMNS}
      selection={crossfilter}
      whereExpr={whereExpr}
      palette={palette}
      orderings={ORDERINGS}
      dark={dark}
      maxNodesPerColumn={10}
    />
  );
}
