import { Box, Flex, Stat, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import * as vg from "@uwdata/vgplot";
import { useSWEBench } from "../../../contexts/SWEBenchContext";

interface Stats {
  traceCount: number;
  totalSpans: number;
  llmCalls: number;
  totalTokens: number;
  avgDuration: number;
  totalDuration: number;
}

export function StatsPanel() {
  const { state, traceIdValue } = useSWEBench();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (state.status !== "ready") return;

    const fetchStats = async () => {
      setLoading(true);
      try {
        const coordinator = vg.coordinator();

        const result = traceIdValue
          ? await coordinator.query(`
              SELECT 1 as trace_count, span_count as total_spans, llm_count, total_tokens, total_duration
              FROM trace_metrics WHERE trace_id = '${traceIdValue}'
            `)
          : await coordinator.query(`
              SELECT 
                (SELECT COUNT(*) FROM trace_metrics) as trace_count,
                (SELECT COUNT(*) FROM spans) as total_spans,
                SUM(llm_count) as llm_count,
                SUM(total_tokens) as total_tokens,
                AVG(total_duration) as avg_duration,
                SUM(total_duration) as total_duration
              FROM trace_metrics
            `);

        if (result?.numRows > 0) {
          const row = result.get(0);
          setStats({
            traceCount: Number(row.trace_count) || 0,
            totalSpans: Number(row.total_spans) || 0,
            llmCalls: Number(row.llm_count) || 0,
            totalTokens: Number(row.total_tokens) || 0,
            avgDuration: Number(row.avg_duration || row.total_duration) || 0,
            totalDuration: Number(row.total_duration) || 0,
          });
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [state.status, traceIdValue]);

  if (state.status !== "ready" || loading || !stats) {
    return (
      <Box p={4}>
        <Text fontSize="sm" color="gray.500">
          Loading stats...
        </Text>
      </Box>
    );
  }

  const statItems = [
    { label: "Traces", value: stats.traceCount },
    { label: "Spans", value: stats.totalSpans.toLocaleString() },
    { label: "LLM Calls", value: stats.llmCalls.toLocaleString() },
    { label: "Tokens", value: stats.totalTokens.toLocaleString() },
    {
      label: traceIdValue ? "Duration" : "Avg Duration",
      value: `${stats.avgDuration.toFixed(1)}s`,
    },
    { label: "Total Duration", value: `${stats.totalDuration.toFixed(1)}s` },
  ];

  return (
    <Box py={2}>
      <Flex gap={10} wrap="wrap">
        {statItems.map((item, idx) => (
          <Flex key={idx} align="center">
            <Stat.Root size="sm">
              <Stat.Label
                fontSize="xs"
                fontWeight="medium"
                color="accentSubtle"
              >
                {item.label}
              </Stat.Label>
              <Stat.ValueText fontSize="md" fontWeight="semibold">
                {item.value}
              </Stat.ValueText>
            </Stat.Root>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}
