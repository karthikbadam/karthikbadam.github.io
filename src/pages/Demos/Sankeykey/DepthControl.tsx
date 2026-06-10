// San(key)ⁿ — the primary control: a play/pause auto-expand toggle and the
// prominent `n` slider (capped at the loaded dataset's real max depth) that
// drives how many tool-call columns the sankey unfolds.

import { useEffect } from "react";
import { Flex, IconButton, Slider, Text } from "@chakra-ui/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { LuPause, LuPlay } from "react-icons/lu";
import {
  depthAtom,
  maxDepthAtom,
  playingAtom,
  resetSignalAtom,
  sankeyActiveAtom,
} from "./atoms";

/** Tick marks that stay legible as the max grows: always 1 and max, plus a
 * rounded interior step (every 5 ≤20, every 10 ≤50, every 20 beyond). */
function buildMarks(max: number): { value: number; label: string }[] {
  const step = max <= 20 ? 5 : max <= 50 ? 10 : 20;
  const values = new Set<number>([1, max]);
  for (let v = step; v < max; v += step) values.add(v);
  return Array.from(values)
    .sort((a, b) => a - b)
    .map((value) => ({ value, label: `${value}` }));
}

/** Animates the depth slider 1→max while playing; stops at the end. Pressing
 * play at max restarts the sweep from the entry tool. */
function useAutoExpand(max: number, stepMs = 800) {
  const [playing, setPlaying] = useAtom(playingAtom);
  const depth = useAtomValue(depthAtom);
  const setDepth = useSetAtom(depthAtom);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setDepth((d) => {
        if (d >= max) {
          setPlaying(false);
          return d;
        }
        return d + 1;
      });
    }, stepMs);
    return () => clearInterval(id);
  }, [playing, stepMs, max, setDepth, setPlaying]);

  const toggle = () => {
    if (!playing && depth >= max) setDepth(1);
    setPlaying((p) => !p);
  };
  const stop = () => setPlaying(false);

  return { playing, toggle, stop };
}

export function DepthControl() {
  const [depth, setDepth] = useAtom(depthAtom);
  const maxDepth = useAtomValue(maxDepthAtom);
  const sankeyActive = useAtomValue(sankeyActiveAtom);
  const setResetSignal = useSetAtom(resetSignalAtom);
  const { playing, toggle, stop } = useAutoExpand(maxDepth);

  return (
    <Flex align="center" gap={4} flex="1" minW={0}>
      <IconButton
        aria-label={playing ? "Pause auto-expand" : "Auto-expand n"}
        size="sm"
        variant="outline"
        color="accent"
        borderColor="accent"
        onClick={toggle}
        flexShrink={0}
      >
        {playing ? <LuPause /> : <LuPlay />}
      </IconButton>
      <Slider.Root
        value={[depth]}
        onValueChange={(d) => {
          stop();
          setDepth(d.value[0]);
        }}
        min={1}
        max={maxDepth}
        step={1}
        flex="1"
        pb={4}
      >
        <Slider.Control>
          <Slider.Track>
            <Slider.Range />
          </Slider.Track>
          <Slider.Thumbs />
          <Slider.Marks marks={buildMarks(maxDepth)} fontSize="xs" />
        </Slider.Control>
      </Slider.Root>
      {sankeyActive && (
        <Text
          as="button"
          fontSize="xs"
          color="accent"
          textDecoration="underline"
          flexShrink={0}
          onClick={() => setResetSignal((n) => n + 1)}
        >
          clear
        </Text>
      )}
      <Flex
        align="baseline"
        gap={1}
        bg="bg.muted"
        borderRadius="md"
        px={3}
        py={1}
        flexShrink={0}
      >
        <Text fontFamily="mono" fontSize="xs" color="fg.muted">
          n =
        </Text>
        <Text fontFamily="mono" fontSize="md" fontWeight="bold" color="accent" minW="2ch" textAlign="right">
          {depth}
        </Text>
      </Flex>
    </Flex>
  );
}
