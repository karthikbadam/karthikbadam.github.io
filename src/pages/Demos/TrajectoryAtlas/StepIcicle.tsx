// Trajectory Atlas — StepIcicle. Thin wrapper around the generic
// IcicleMosaicClient that supplies the trajectory step taxonomy and the
// site's accent ramp (light: blue, dark: sand). The path tree groups by
// the actual `tool` name (e.g. `web_search`, `final_answer`) rather than
// the broader category so users see what was actually invoked.

import { useColorMode } from "../../../components/ui/color-mode";
import { IcicleMosaicClient } from "../../../components/IcicleMosaicClient";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { accentRamp } from "./taxonomy";

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
      idCol="traj_id"
      levelCol="step_idx"
      categoryCol="name"
      selection={crossfilter}
      // Drop meta-steps so each visible level represents the i-th tool call
      // rather than the i-th raw message.
      filterStepNames={["task", "thought", "observation", "think", "thinking"]}
      // Collapse the long tail of rare tools into an "other (N)" node per level.
      maxNodesPerLevel={10}
      colorRamp={(level, maxLevel) =>
        accentRamp(level / Math.max(1, maxLevel - 1), colorMode === "dark")
      }
      dark={colorMode === "dark"}
      highlightedTrajIds={highlight}
    />
  );
}
