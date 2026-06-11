// San(key)ⁿ depth control: play/pause auto-expand plus the n slider, capped
// at the loaded dataset's real max depth.

import { useEffect } from "react";
import { Button, Flex, Slider, Text } from "@chakra-ui/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { LuPause, LuPlay } from "react-icons/lu";
import {
  depthAtom,
  maxDepthAtom,
  playingAtom,
  resetSignalAtom,
  sankeyActiveAtom,
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
    <Flex align="center" gap={3} w="100%" wrap="wrap">
      <Text fontSize="sm" fontWeight="semibold" flexShrink={0}>
        Tool calls (n ={" "}
        <Text as="span" fontFamily="mono" color="accent">
          {depth}
        </Text>
        )
      </Text>
      {/* Keep the slider grouped with its 1…max labels so they never wrap
          apart when the row collapses on narrow screens. */}
      <Flex align="center" gap={3} flex="1" minW="200px">
        <Text fontFamily="mono" fontSize="xs" color="fg.muted" flexShrink={0}>
          1
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
          flex="1"
          size="sm"
        >
          <Slider.Control>
            <Slider.Track>
              <Slider.Range />
            </Slider.Track>
            <Slider.Thumbs />
          </Slider.Control>
        </Slider.Root>
        <Text fontFamily="mono" fontSize="xs" color="fg.muted" flexShrink={0}>
          {maxDepth}
        </Text>
      </Flex>
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
      <Button
        size="sm"
        variant="outline"
        color="accent"
        borderColor="accent"
        onClick={toggle}
        flexShrink={0}
        minW="7em"
      >
        {playing ? <LuPause /> : <LuPlay />}
        {playing ? "Freeze" : "Animate"}
      </Button>
    </Flex>
  );
}
