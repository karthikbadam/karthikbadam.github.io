// Trajectory Atlas — StepIcicle. Renders every message in the trajectory
// (task / thought / observation / each tool call). Deep trajectories scroll
// inside the panel via the IcicleMosaicClient's minRowHeight.

import { useAtomValue, useSetAtom } from "jotai";
import { useColorMode } from "../../../components/ui/color-mode";
import { IcicleMosaicClient } from "../../../components/IcicleMosaicClient";
import {
  coordinatorAtom,
  crossfilterAtom,
  highlightedTrajIdAtom,
  icicleActiveAtom,
  resetSignalAtom,
} from "./atoms";
import { accentRamp } from "../../../components/taxonomy";

export function StepIcicle() {
  const coordinator = useAtomValue(coordinatorAtom);
  const crossfilter = useAtomValue(crossfilterAtom);
  const highlightedTrajId = useAtomValue(highlightedTrajIdAtom);
  const resetSignal = useAtomValue(resetSignalAtom);
  const setIcicleSelectionActive = useSetAtom(icicleActiveAtom);
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
      highlightedTrajIds={highlightedTrajId ? new Set([highlightedTrajId]) : null}
      resetSignal={resetSignal}
      onSelectionStateChange={setIcicleSelectionActive}
    />
  );
}
