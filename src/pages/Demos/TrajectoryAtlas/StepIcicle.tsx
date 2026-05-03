// Trajectory Atlas — StepIcicle. Renders every message in the trajectory
// (task / thought / observation / each tool call). Deep trajectories scroll
// inside the panel via the IcicleMosaicClient's minRowHeight.

import { useColorMode } from "../../../components/ui/color-mode";
import { IcicleMosaicClient } from "../../../components/IcicleMosaicClient";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { accentRamp } from "./taxonomy";

export function StepIcicle() {
  const { coordinator, crossfilter, selectedTrajectory } = useTrajectoryAtlas();
  const { colorMode } = useColorMode();
  const dark = colorMode === "dark";

  if (!coordinator) return null;

  return (
    <IcicleMosaicClient
      coordinator={coordinator}
      table="steps"
      idCol="id"
      levelCol="step_idx"
      categoryCol="name"
      selection={crossfilter}
      minRowHeight={28}
      colorRamp={(level, maxLevel) =>
        accentRamp(level / Math.max(1, maxLevel - 1), dark)
      }
      dark={dark}
      highlightedTrajIds={
        selectedTrajectory ? new Set([selectedTrajectory.id]) : null
      }
    />
  );
}
