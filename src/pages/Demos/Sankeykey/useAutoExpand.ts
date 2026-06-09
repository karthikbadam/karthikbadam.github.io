import { useEffect } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { MAX_DEPTH, depthAtom, playingAtom } from "./atoms";

/** Animates the depth slider 1→MAX_DEPTH while playing; stops at the end.
 * Pressing play at max restarts the sweep from the entry tool. */
export function useAutoExpand(stepMs = 800) {
  const [playing, setPlaying] = useAtom(playingAtom);
  const depth = useAtomValue(depthAtom);
  const setDepth = useSetAtom(depthAtom);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setDepth((d) => {
        if (d >= MAX_DEPTH) {
          setPlaying(false);
          return d;
        }
        return d + 1;
      });
    }, stepMs);
    return () => clearInterval(id);
  }, [playing, stepMs, setDepth, setPlaying]);

  const toggle = () => {
    if (!playing && depth >= MAX_DEPTH) setDepth(1);
    setPlaying((p) => !p);
  };
  const stop = () => setPlaying(false);

  return { playing, toggle, stop };
}
