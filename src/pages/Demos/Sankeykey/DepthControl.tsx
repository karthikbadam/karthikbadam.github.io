// Sankeykey — the centerpiece control bar: play button, wide tick-marked
// depth slider, and a live "depth survival" readout.

import { useEffect } from "react";
import { Button, ButtonGroup, Flex, IconButton, Slider, Text } from "@chakra-ui/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { LuPause, LuPlay } from "react-icons/lu";
import {
  MAX_DEPTH,
  SOURCES,
  depthAtom,
  loadedSourceAtom,
  playingAtom,
  resetSignalAtom,
  sankeyActiveAtom,
  survivalAtom,
  switchSourceAtom,
  type SourceKey,
} from "./atoms";

const SOURCE_KEYS = Object.keys(SOURCES) as SourceKey[];

const MARKS = Array.from({ length: MAX_DEPTH }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}`,
}));

/** Animates the depth slider 1→MAX_DEPTH while playing; stops at the end.
 * Pressing play at max restarts the sweep from the entry tool. */
function useAutoExpand(stepMs = 800) {
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

export function DepthControl() {
  const [depth, setDepth] = useAtom(depthAtom);
  const survival = useAtomValue(survivalAtom);
  const sankeyActive = useAtomValue(sankeyActiveAtom);
  const setResetSignal = useSetAtom(resetSignalAtom);
  const loadedSource = useAtomValue(loadedSourceAtom);
  const switchSource = useSetAtom(switchSourceAtom);
  const { playing, toggle, stop } = useAutoExpand();

  const pct =
    survival && survival.total > 0
      ? Math.round((100 * survival.ge[depth - 1]) / survival.total)
      : null;
  const paths = survival ? survival.paths[depth - 1] : null;

  return (
    <Flex
      align="center"
      gap={{ base: 4, md: 6 }}
      wrap="wrap"
      p={4}
      borderWidth="1px"
      borderColor="gray.subtle"
      borderRadius="lg"
      bg="bg"
    >
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
        max={MAX_DEPTH}
        step={1}
        flex="1"
        minW="220px"
        maxW="520px"
        pb={4}
      >
        <Slider.Label fontSize="xs" color="fg.muted" textTransform="uppercase">
          tool calls shown
        </Slider.Label>
        <Slider.Control>
          <Slider.Track>
            <Slider.Range />
          </Slider.Track>
          <Slider.Thumbs />
          <Slider.Marks marks={MARKS} fontSize="xs" />
        </Slider.Control>
      </Slider.Root>
      <Text fontSize="sm" color="fg.muted">
        <Text as="span" fontFamily="mono" fontWeight="bold" color="fg">
          {paths === null ? "—" : paths.toLocaleString()}
        </Text>{" "}
        distinct tool {paths === 1 ? "path" : "paths"} through the first{" "}
        {depth === 1 ? "call" : `${depth} calls`} ·{" "}
        <Text as="span" fontFamily="mono">
          {pct === null ? "—" : `${pct}%`}
        </Text>{" "}
        of rollouts make ≥{depth} tool {depth === 1 ? "call" : "calls"}
      </Text>
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
            >
              {SOURCES[key].label}
            </Button>
          );
        })}
      </ButtonGroup>
    </Flex>
  );
}
