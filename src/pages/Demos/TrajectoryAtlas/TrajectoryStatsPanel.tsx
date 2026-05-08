// TrajectoryStatsPanel — KPI strip + search + outcome filter chips, styled
// to match the SWE-Bench StatsPanel pattern (compact single-row Stat tiles
// inside a `bg.panel` card).

import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  NativeSelect,
  Stat,
  Text,
} from "@chakra-ui/react";
import { LuSearch, LuX } from "react-icons/lu";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  clearAllAtom,
  hasActiveSelectionAtom,
  outcomeFilterAtom,
  searchAtom,
  sourceAtom,
  sourcesAtom,
  statsAtom,
} from "./atoms";
import type { Outcome, SourceKey } from "./types";

const OUTCOMES: Array<Outcome | "all"> = ["all", "success", "partial", "fail"];

export function TrajectoryStatsPanel() {
  const sources = useAtomValue(sourcesAtom);
  const [source, setSource] = useAtom(sourceAtom);
  const [search, setSearch] = useAtom(searchAtom);
  const [outcomeFilter, setOutcomeFilter] = useAtom(outcomeFilterAtom);
  const hasActiveSelection = useAtomValue(hasActiveSelectionAtom);
  const clearAll = useSetAtom(clearAllAtom);
  const stats = useAtomValue(statsAtom);

  const passRate = stats.n
    ? `${((stats.pass / stats.n) * 100).toFixed(1)}%`
    : "—";
  const avgSteps = stats.avgSteps ? stats.avgSteps.toFixed(1) : "—";
  const avgTokens = stats.avgTokens ? formatTokens(stats.avgTokens) : "—";

  const items = [
    { label: "Trajectories", value: stats.n.toLocaleString() },
    { label: "Pass rate", value: passRate, accent: true },
    { label: "Avg steps", value: avgSteps },
    { label: "Avg tokens", value: avgTokens },
  ];

  return (
    <Box py={2}>
      <Flex columnGap={10} rowGap={2} wrap="wrap" justify="space-between">
        <Flex gap={4} wrap="nowrap">
          {items.map((item) => (
            <Stat.Root key={item.label} size="sm" px={0} minW="5rem">
              <Stat.Label
                fontSize="xs"
                fontWeight="medium"
                color="accentSubtle"
                whiteSpace="nowrap"
              >
                {item.label}
              </Stat.Label>
              <Stat.ValueText
                fontSize="md"
                fontWeight="semibold"
                color={item.accent ? "accent" : undefined}
                whiteSpace="nowrap"
              >
                {item.value}
              </Stat.ValueText>
            </Stat.Root>
          ))}
        </Flex>

        <HStack columnGap={4} flexWrap="wrap">
          <NativeSelect.Root
            size="sm"
            w="auto"
            minW={{ base: "auto", md: "200px" }}
            bg="bg.subtle"
            flex={{ base: 1, md: "0 0 auto" }}
          >
            <NativeSelect.Field
              value={source}
              onChange={(e) => setSource(e.target.value as SourceKey)}
              color="fg"
              fontSize="sm"
            >
              {Object.values(sources).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          <HStack
            gap={1}
            px={2}
            borderRadius="md"
            border="1px solid"
            borderColor="gray.muted"
            bg="bg.subtle"
            minW="250px"
            height="auto"
            display={{ base: "none", md: "flex" }}
          >
            <LuSearch size={13} />
            <Input
              variant="outline"
              border="none"
              boxShadow="none"
              size="sm"
              placeholder="Search id, task, model…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              px={0}
              _focus={{ outline: "none", boxShadow: "none" }}
            />
            {search && (
              <Button
                size="xs"
                variant="ghost"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <LuX size={12} />
              </Button>
            )}
          </HStack>

          <HStack
            gap={0}
            borderRadius="md"
            border="1px solid"
            borderColor="gray.muted"
            bg="bg.subtle"
          >
            {OUTCOMES.map((o) => (
              <Button
                key={o}
                size="xs"
                variant={outcomeFilter === o ? "solid" : "ghost"}
                colorPalette={
                  outcomeFilter === o
                    ? o === "success"
                      ? "blue"
                      : o === "partial"
                        ? "orange"
                        : o === "fail"
                          ? "red"
                          : "gray"
                    : "undefined"
                }
                onClick={() => setOutcomeFilter(o)}
                textTransform="capitalize"
              >
                {o === "success" ? "Pass" : o}
              </Button>
            ))}
          </HStack>

          {hasActiveSelection && (
            <Button
              size="sm"
              colorPalette="orange"
              variant="solid"
              onClick={() => clearAll()}
            >
              <LuX size={14} />
              Clear filters
            </Button>
          )}
        </HStack>
      </Flex>

      {stats.n === 0 && (
        <Text mt={2} fontSize="xs" color="fg.subtle">
          No trajectories match the current filters.
        </Text>
      )}
    </Box>
  );
}

function formatTokens(t: number): string {
  if (!Number.isFinite(t) || t <= 0) return "—";
  if (t < 1000) return Math.round(t).toString();
  if (t < 1_000_000) return `${(t / 1000).toFixed(1)}k`;
  return `${(t / 1_000_000).toFixed(2)}M`;
}
