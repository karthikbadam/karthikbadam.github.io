// San(key)ⁿ — compact dataset selector. Swaps the live DuckDB table; the
// chart remounts on the new source (see loadedSourceAtom).

import { Button, ButtonGroup } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { SOURCES, loadedSourceAtom, switchSourceAtom, type SourceKey } from "./atoms";

const SOURCE_KEYS = Object.keys(SOURCES) as SourceKey[];

export function SourceToggle() {
  const loadedSource = useAtomValue(loadedSourceAtom);
  const switchSource = useSetAtom(switchSourceAtom);

  return (
    <ButtonGroup size="xs" variant="outline" attached>
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
  );
}
