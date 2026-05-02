// Trajectory Atlas — StepIcicle. Thin wrapper around the generic
// IcicleMosaicClient. Shows every message in the trajectory (task, thought,
// observation, and every tool call) and every distinct tool name; deep
// trajectories scroll within the panel. The sankey takes the role of
// summarising entry → dominant → outcome because it can collapse the long
// tail; the icicle's job is full fidelity.

import { useColorMode } from "../../../components/ui/color-mode";
import { IcicleMosaicClient } from "../../../components/IcicleMosaicClient";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { accentRamp } from "./taxonomy";

export function StepIcicle() {
  const { coordinator, crossfilter, selectedTrajectory, filterPredicate } =
    useTrajectoryAtlas();
  const { colorMode } = useColorMode();

  if (!coordinator) {
    return null;
  }

  const highlight = selectedTrajectory ? new Set([selectedTrajectory.id]) : null;
  // The user's UI filters live on the trajectory row. Push them into the
  // steps query as a subquery: `id IN (SELECT id FROM trajectories WHERE ...)`.
  const whereExpr = filterPredicate
    ? `id IN (SELECT id FROM trajectories WHERE ${filterPredicate})`
    : null;

  return (
    <IcicleMosaicClient
      coordinator={coordinator}
      table="steps"
      idCol="id"
      levelCol="step_idx"
      categoryCol="name"
      selection={crossfilter}
      whereExpr={whereExpr}
      minRowHeight={28}
      colorRamp={(level, maxLevel) =>
        accentRamp(level / Math.max(1, maxLevel - 1), colorMode === "dark")
      }
      dark={colorMode === "dark"}
      highlightedTrajIds={highlight}
    />
  );
}
