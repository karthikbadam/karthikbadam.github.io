// Trajectory Atlas — StepIcicle. Thin wrapper around the generic
// IcicleMosaicClient that supplies the trajectory-step taxonomy + the
// site's accent ramp (light: blue, dark: sand).

import { useColorMode } from "../../../components/ui/color-mode";
import { IcicleMosaicClient } from "../../../components/IcicleMosaicClient";
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import { CATEGORY_LABELS, accentRamp } from "./taxonomy";
import type { Category } from "./types";

export function StepIcicle() {
  const { coordinator, crossfilter, selectedTrajectory } = useTrajectoryAtlas();
  const { colorMode } = useColorMode();

  if (!coordinator) {
    return <div className="ta-viz-root" />;
  }

  const highlight = selectedTrajectory ? new Set([selectedTrajectory.id]) : null;

  return (
    <IcicleMosaicClient
      coordinator={coordinator}
      table="steps"
      idCol="traj_id"
      levelCol="step_idx"
      categoryCol="category"
      selection={crossfilter}
      colorRamp={(level, maxLevel) =>
        accentRamp(level / Math.max(1, maxLevel - 1), colorMode === "dark")
      }
      labelFor={(c) => CATEGORY_LABELS[c as Category] ?? c}
      dark={colorMode === "dark"}
      highlightedTrajIds={highlight}
    />
  );
}
