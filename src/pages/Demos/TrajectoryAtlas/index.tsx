import { useEffect } from "react";
import { Provider, useAtomValue, useSetAtom } from "jotai";
import { Page } from "../../../components/Page";
import { Dashboard } from "./Dashboard";
import {
  isReadyAtom,
  outcomeFilterAtom,
  pushFilterToCrossfilterAtom,
  refreshStatsAtom,
  searchAtom,
  sourceAtom,
  switchSourceAtom,
} from "./atoms";

/**
 * Bridges that translate the old Provider's useEffects into reactive atom subscriptions.
 * They render nothing — only wire UI state changes back into the crossfilter / DuckDB.
 */
function FilterBridge() {
  const search = useAtomValue(searchAtom);
  const outcome = useAtomValue(outcomeFilterAtom);
  const isReady = useAtomValue(isReadyAtom);
  const pushFilter = useSetAtom(pushFilterToCrossfilterAtom);
  const refreshStats = useSetAtom(refreshStatsAtom);

  useEffect(() => {
    if (!isReady) return;
    pushFilter();
    refreshStats();
  }, [search, outcome, isReady, pushFilter, refreshStats]);

  return null;
}

function SourceWatcher() {
  const source = useAtomValue(sourceAtom);
  const isReady = useAtomValue(isReadyAtom);
  const switchSource = useSetAtom(switchSourceAtom);

  useEffect(() => {
    if (!isReady) return;
    switchSource(source);
  }, [source, isReady, switchSource]);

  return null;
}

export function TrajectoryAtlas() {
  return (
    <Page>
      <Provider>
        <FilterBridge />
        <SourceWatcher />
        <Dashboard />
      </Provider>
    </Page>
  );
}
