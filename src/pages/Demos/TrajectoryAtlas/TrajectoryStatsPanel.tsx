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
import { useTrajectoryAtlas } from "../../../contexts/TrajectoryAtlasContext";
import type { Outcome, SourceKey } from "./types";

const OUTCOMES: Array<Outcome | "all"> = ["all", "success", "partial", "fail"];

export function TrajectoryStatsPanel() {
  const {
    sources,
    source,
    setSource,
    search,
    setSearch,
    outcomeFilter,
    setOutcomeFilter,
    stats,
  } = useTrajectoryAtlas();

  const passRate = stats.n ? `${((stats.pass / stats.n) * 100).toFixed(1)}%` : "—";
  const avgSteps = stats.avgSteps ? stats.avgSteps.toFixed(1) : "—";
  const avgTokens = stats.avgTokens ? formatTokens(stats.avgTokens) : "—";

  const items = [
    { label: "Trajectories", value: stats.n.toLocaleString() },
    { label: "Pass rate", value: passRate, accent: true },
    { label: "Avg steps", value: avgSteps },
    { label: "Avg tokens", value: avgTokens },
  ];

  return (
    <Box
      px={3}
      py={2}
      borderRadius="lg"
      bg="bg.panel"
      border="1px solid"
      borderColor="gray.subtle"
    >
      <Flex gap={4} wrap="wrap" align="center" justify="space-between">
        <Flex gap={5} wrap="nowrap">
          {items.map((item) => (
            <Stat.Root key={item.label} size="sm" px={0} minW="6rem">
              <Stat.Label fontSize="xs" color="accentSubtle" whiteSpace="nowrap">
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

        <HStack gap={2} flexWrap="wrap">
          <HStack
            gap={1}
            px={2}
            h={8}
            borderRadius="md"
            border="1px solid"
            borderColor="gray.subtle"
            bg="bg.subtle"
            minW="220px"
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

          <NativeSelect.Root size="sm" w="auto" minW="200px">
            <NativeSelect.Field
              value={source}
              onChange={(e) => setSource(e.target.value as SourceKey)}
              bg="accentBackground"
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

          <HStack gap={0} bg="bg.muted" p="2px" borderRadius="md">
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
                    : undefined
                }
                onClick={() => setOutcomeFilter(o)}
                textTransform="capitalize"
              >
                {o === "success" ? "Pass" : o}
              </Button>
            ))}
          </HStack>
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
