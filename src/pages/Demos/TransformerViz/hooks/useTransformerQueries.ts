import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import {
  coordinatorAtom,
  queryFacetedHeatmapData,
  queryLayerAcrossTokens,
  queryTokenAcrossLayers,
  refreshSelectionStatsAtom,
  selectedPromptIdAtom,
} from "../atoms";

/**
 * Imperative query helpers for ad-hoc detail-panel queries. Reads the current
 * coordinator + promptId from atoms internally — callers don't have to thread them.
 */
export function useTransformerQueries() {
  const coord = useAtomValue(coordinatorAtom);
  const promptId = useAtomValue(selectedPromptIdAtom);
  const refreshStats = useSetAtom(refreshSelectionStatsAtom);

  const heatmap = useCallback(
    (metric: string) =>
      coord && promptId !== null
        ? queryFacetedHeatmapData(coord, promptId, metric)
        : Promise.resolve([]),
    [coord, promptId],
  );

  const tokenAcrossLayers = useCallback(
    (position: number, metric: string) =>
      coord && promptId !== null
        ? queryTokenAcrossLayers(coord, promptId, position, metric)
        : Promise.resolve([] as number[]),
    [coord, promptId],
  );

  const layerAcrossTokens = useCallback(
    (layer: number, metric: string) =>
      coord && promptId !== null
        ? queryLayerAcrossTokens(coord, promptId, layer, metric)
        : Promise.resolve({
            stats: { count: 0, mean: 0, max: 0, min: 0, std: 0 },
            headBreakdown: [] as number[],
            topTokens: [] as Array<{ tokenText: string; value: number }>,
          }),
    [coord, promptId],
  );

  const refreshSelectionStats = useCallback(
    () => refreshStats(),
    [refreshStats],
  );

  return {
    queryFacetedHeatmapData: heatmap,
    queryTokenAcrossLayers: tokenAcrossLayers,
    queryLayerAcrossTokens: layerAcrossTokens,
    refreshSelectionStats,
  };
}
