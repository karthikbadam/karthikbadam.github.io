// Sankeykey — the centerpiece control bar: play button, wide tick-marked
// depth slider, and a live "depth survival" readout.

import { Button, ButtonGroup, Flex, IconButton, Slider, Text } from "@chakra-ui/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { LuPause, LuPlay } from "react-icons/lu";
import {
  MAX_DEPTH,
  SOURCES,
  depthAtom,
  loadedSourceAtom,
  resetSignalAtom,
  sankeyActiveAtom,
  survivalAtom,
  switchSourceAtom,
  type SourceKey,
} from "./atoms";
import { useAutoExpand } from "./useAutoExpand";

const SOURCE_KEYS = Object.keys(SOURCES) as SourceKey[];

const MARKS = Array.from({ length: MAX_DEPTH }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}`,
}));

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
