// Trajectory Atlas — StepIcicle. Thin wrapper around the generic
// IcicleMosaicClient that supplies the trajectory step taxonomy and the
// site's accent ramp. The set of step names hidden from the path tree is
// driven by the context so the user can toggle meta-step inclusion.

import { useColorMode } from "../../../components/ui/color-mode";
import { IcicleMosaicClient } from "../../../components/IcicleMosaicClient";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { accentRamp } from "./taxonomy";

export function StepIcicle() {
  const { coordinator, crossfilter, selectedTrajectory, hiddenStepNames } =
    useTrajectoryAtlas();
  const { colorMode } = useColorMode();

  if (!coordinator) {
    return null;
  }

  const highlight = selectedTrajectory ? new Set([selectedTrajectory.id]) : null;
  const filterStepNames = Array.from(hiddenStepNames);

  return (
    <IcicleMosaicClient
      coordinator={coordinator}
      table="steps"
      idCol="traj_id"
      levelCol="step_idx"
      categoryCol="name"
      selection={crossfilter}
      filterStepNames={filterStepNames}
      maxNodesPerLevel={10}
      colorRamp={(level, maxLevel) =>
        accentRamp(level / Math.max(1, maxLevel - 1), colorMode === "dark")
      }
      dark={colorMode === "dark"}
      highlightedTrajIds={highlight}
    />
  );
}
