// Trajectory Atlas — StepIcicle. Thin wrapper around the generic
// IcicleMosaicClient. Filters out meta-steps so each visible level is
// the i-th tool call; the sankey owns the user-toggleable chip filter
// because that's where label collisions actually hurt.

import { useColorMode } from "../../../components/ui/color-mode";
import { IcicleMosaicClient } from "../../../components/IcicleMosaicClient";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { accentRamp } from "./taxonomy";

const ICICLE_HIDDEN_STEPS = ["task", "thought", "observation"];

export function StepIcicle() {
  const { coordinator, crossfilter, selectedTrajectory } = useTrajectoryAtlas();
  const { colorMode } = useColorMode();

  if (!coordinator) {
    return null;
  }

  const highlight = selectedTrajectory ? new Set([selectedTrajectory.id]) : null;

  return (
    <IcicleMosaicClient
      coordinator={coordinator}
      table="steps"
      idCol="id"
      levelCol="step_idx"
      categoryCol="name"
      selection={crossfilter}
      filterStepNames={ICICLE_HIDDEN_STEPS}
      maxNodesPerLevel={12}
      minRowHeight={24}
      colorRamp={(level, maxLevel) =>
        accentRamp(level / Math.max(1, maxLevel - 1), colorMode === "dark")
      }
      dark={colorMode === "dark"}
      highlightedTrajIds={highlight}
    />
  );
}
