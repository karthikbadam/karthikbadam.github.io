import { useEffect, useState, useRef, useCallback } from "react";
import { isNotDistinct, literal } from "@uwdata/mosaic-sql";
import { useGaia } from "../../../contexts/GaiaContext";

/** Star data with source_id for hover identification */
export interface HoverableStar {
  source_id: string;
}

interface UseStarHoverOptions<T extends HoverableStar> {
  /** Delay in ms before hover selection is triggered */
  dwellTime?: number;
  /** Function to find a star by source_id from current data */
  findStar: (sourceId: string) => T | undefined;
}

interface UseStarHoverReturn<T extends HoverableStar> {
  /** Currently selected star (after dwell time) */
  selectedStar: T | null;
  /** Start hover timer for a star */
  onStarHover: (star: T) => void;
  /** Clear hover timer (when mouse leaves star) */
  onStarLeave: () => void;
}

/**
 * Hook to manage star hover selection with dwell time
 * Integrates with Mosaic hoverSelection for cross-component coordination
 */
export function useStarHover<T extends HoverableStar>({
  dwellTime = 500,
  findStar,
}: UseStarHoverOptions<T>): UseStarHoverReturn<T> {
  const { hoverSelection } = useGaia();
  const [selectedStar, setSelectedStar] = useState<T | null>(null);

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredSourceIdRef = useRef<string | null>(null);
  const hoverSourceRef = useRef({ name: "3d-view-hover" });

  // Listen to hoverSelection changes from Mosaic
  useEffect(() => {
    if (!hoverSelection) return;

    const handleSelectionChange = () => {
      const clauses = hoverSelection.clauses ?? [];
      if (clauses.length > 0 && clauses[0]?.value) {
        const sourceId = String(clauses[0].value);
        const star = findStar(sourceId);
        setSelectedStar(star || null);
      } else {
        setSelectedStar(null);
      }
    };

    handleSelectionChange();
    hoverSelection.addEventListener("value", handleSelectionChange);
    return () =>
      hoverSelection.removeEventListener("value", handleSelectionChange);
  }, [hoverSelection, findStar]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const onStarHover = useCallback(
    (star: T) => {
      if (star.source_id === lastHoveredSourceIdRef.current) return;

      // Clear any existing timer
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
      lastHoveredSourceIdRef.current = star.source_id;

      // Start new timer to update hoverSelection after dwell time
      hoverTimerRef.current = setTimeout(() => {
        if (hoverSelection) {
          hoverSelection.update({
            source: hoverSourceRef.current,
            clients: new Set([]),
            value: star.source_id,
            predicate: isNotDistinct("source_id", literal(star.source_id)),
          });
        }
      }, dwellTime);
    },
    [hoverSelection, dwellTime]
  );

  const onStarLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    lastHoveredSourceIdRef.current = null;
    // Note: Don't clear hoverSelection - keep it so user can interact with links
  }, []);

  return { selectedStar, onStarHover, onStarLeave };
}
