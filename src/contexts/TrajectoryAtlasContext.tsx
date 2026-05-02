// Trajectory Atlas context — fully implemented in commit 3.
// This scaffold lets the demo render with a "loading" state until then.

import { createContext, useContext, useMemo, useState, ReactNode } from "react";
import type { Coordinator, Selection as VgSelection } from "@uwdata/mosaic-core";
import type { LoadingState } from "../types/loading";
import type { Outcome, SourceKey, Trajectory } from "../pages/Demos/TrajectoryAtlas/types";

export interface TrajectoryAtlasContextValue {
  state: LoadingState;
  source: SourceKey;
  setSource: (s: SourceKey) => void;

  coordinator: Coordinator | null;
  crossfilter: VgSelection | null;
  rowSelection: VgSelection | null;
  hover: VgSelection | null;

  search: string;
  setSearch: (s: string) => void;
  outcomeFilter: Outcome | "all";
  setOutcomeFilter: (s: Outcome | "all") => void;
  datasetFilter: string | "all";
  setDatasetFilter: (s: string | "all") => void;
  modelFilter: string | "all";
  setModelFilter: (s: string | "all") => void;

  selectedTrajectory: Trajectory | null;
  setRowSelection: (t: Trajectory | null) => void;

  stats: { n: number; pass: number; avgSteps: number; avgCost: number };
  datasets: string[];
  models: string[];
}

const Ctx = createContext<TrajectoryAtlasContextValue | null>(null);

export function TrajectoryAtlasProvider({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<Outcome | "all">("all");
  const [datasetFilter, setDatasetFilter] = useState<string | "all">("all");
  const [modelFilter, setModelFilter] = useState<string | "all">("all");
  const [source, setSource] = useState<SourceKey>("qwen");
  const [selectedTrajectory, setSelectedTrajectory] = useState<Trajectory | null>(null);

  // Stub: full Mosaic wiring lands in commit 3.
  const value = useMemo<TrajectoryAtlasContextValue>(
    () => ({
      state: { status: "idle" },
      source,
      setSource,
      coordinator: null,
      crossfilter: null,
      rowSelection: null,
      hover: null,
      search,
      setSearch,
      outcomeFilter,
      setOutcomeFilter,
      datasetFilter,
      setDatasetFilter,
      modelFilter,
      setModelFilter,
      selectedTrajectory,
      setRowSelection: setSelectedTrajectory,
      stats: { n: 0, pass: 0, avgSteps: 0, avgCost: 0 },
      datasets: [],
      models: [],
    }),
    [source, search, outcomeFilter, datasetFilter, modelFilter, selectedTrajectory],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTrajectoryAtlas(): TrajectoryAtlasContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTrajectoryAtlas must be used within TrajectoryAtlasProvider");
  return v;
}
