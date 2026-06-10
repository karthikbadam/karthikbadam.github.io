// San(key)ⁿ — compact depth control for the chart panel header (mirrors the
// Trajectory Atlas SankeyDepthSlider): a play/pause auto-expand toggle, the
// `n` slider capped at the dataset's real max depth, and the live value.

import { useEffect } from "react";
import { Flex, IconButton, Slider, Text } from "@chakra-ui/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { LuPause, LuPlay } from "react-icons/lu";
import {
  depthAtom,
  maxDepthAtom,
  playingAtom,
  sankeyActiveAtom,
  resetSignalAtom,
} from "./atoms";

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
    <Flex align="center" gap={2} flexShrink={0}>
      {sankeyActive && (
        <Text
          as="button"
          fontSize="xs"
          color="accent"
          onClick={() => setResetSignal((n) => n + 1)}
        >
          clear
        </Text>
      )}
      <IconButton
        aria-label={playing ? "Pause auto-expand" : "Auto-expand n"}
        size="xs"
        variant="ghost"
        color="accent"
        onClick={toggle}
      >
        {playing ? <LuPause /> : <LuPlay />}
      </IconButton>
      <Text
        fontSize="xs"
        color="fg.muted"
        textTransform="uppercase"
        letterSpacing="0.04em"
        fontStyle="italic"
      >
        n
      </Text>
      <Slider.Root
        value={[depth]}
        onValueChange={(d) => {
          stop();
          setDepth(d.value[0]);
        }}
        min={1}
        max={maxDepth}
        step={1}
        width="160px"
        size="sm"
      >
        <Slider.Control>
          <Slider.Track>
            <Slider.Range />
          </Slider.Track>
          <Slider.Thumbs />
        </Slider.Control>
      </Slider.Root>
      <Text fontSize="xs" color="fg.muted" fontFamily="mono" minW="3ch" textAlign="right">
        {depth}
      </Text>
    </Flex>
  );
}
