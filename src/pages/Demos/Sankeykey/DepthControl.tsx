// San(key)ⁿ — the control bar: a hero depth slider (capped at the loaded
// dataset's real max depth) with a play button and a compact stats readout,
// plus a compact dataset toggle on a second tier.

import { useEffect } from "react";
import { Button, ButtonGroup, Flex, IconButton, Slider, Text } from "@chakra-ui/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { LuPause, LuPlay } from "react-icons/lu";
import {
  SOURCES,
  depthAtom,
  loadedSourceAtom,
  maxDepthAtom,
  playingAtom,
  resetSignalAtom,
  sankeyActiveAtom,
  survivalAtom,
  switchSourceAtom,
  type SourceKey,
} from "./atoms";

const SOURCE_KEYS = Object.keys(SOURCES) as SourceKey[];

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

/** Animates the depth slider 1→max while playing; stops at the end.
 * Pressing play at max restarts the sweep from the entry tool. */
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
  const survival = useAtomValue(survivalAtom);
  const sankeyActive = useAtomValue(sankeyActiveAtom);
  const setResetSignal = useSetAtom(resetSignalAtom);
  const loadedSource = useAtomValue(loadedSourceAtom);
  const switchSource = useSetAtom(switchSourceAtom);
  const { playing, toggle, stop } = useAutoExpand(maxDepth);

  const pct =
    survival && survival.total > 0
      ? Math.round((100 * survival.ge[depth - 1]) / survival.total)
      : null;
  const paths = survival ? survival.paths[depth - 1] : null;

  return (
    <Flex direction="column" gap={3} p={4} borderWidth="1px" borderColor="gray.subtle" borderRadius="lg" bg="bg">
      {/* Row 1 — hero: play + big slider + compact readout. */}
      <Flex align="center" gap={4}>
        <IconButton
          aria-label={playing ? "Pause auto-expand" : "Auto-expand depth"}
          size="sm"
          variant="outline"
          color="accent"
          borderColor="accent"
          onClick={toggle}
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
        <Text
          fontSize="xs"
          color="fg.muted"
          whiteSpace="nowrap"
          fontFamily="mono"
        >
          <Text as="span" fontWeight="bold" color="fg">
            n = {depth}
          </Text>
          {" · "}
          {paths === null ? "—" : paths.toLocaleString()} tool{" "}
          {paths === 1 ? "sequence" : "sequences"}
          {" · "}
          {pct === null ? "—" : `${pct}%`} reach n
        </Text>
      </Flex>

      {/* Row 2 — meta: clear selection (when active) + compact dataset toggle. */}
      <Flex align="center" gap={3}>
        {sankeyActive && (
          <Button
            size="xs"
            variant="outline"
            color="accent"
            borderColor="accent"
            onClick={() => setResetSignal((n) => n + 1)}
          >
            Clear selection
          </Button>
        )}
        <ButtonGroup size="xs" variant="outline" attached ml="auto">
          {SOURCE_KEYS.map((key) => {
            const active = key === loadedSource;
            return (
              <Button
                key={key}
                onClick={() => switchSource(key)}
                color={active ? "gray.contrast" : "accent"}
                bg={active ? "accent" : undefined}
                borderColor="accent"
                fontFamily="mono"
              >
                {SOURCES[key].short}
              </Button>
            );
          })}
        </ButtonGroup>
      </Flex>
    </Flex>
  );
}
