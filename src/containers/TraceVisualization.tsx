import { SimpleGrid, Stat, Text } from "@chakra-ui/react";
import { useState } from "react";
import { GanttChart } from "../components/GanttChart";
import { IcicleChart } from "../components/IcicleChart";
import { RecordInspector } from "../components/RecordInspector";
import { StackedBarChart } from "../components/StackedBarChart";
import { useTraceData } from "../hooks/useTraceData";

export function TraceMetrics() {
  const { data, loading, error } = useTraceData();
  if (loading) return <Text>Loading...</Text>;
  if (error || !data) return null;
  return (
    <SimpleGrid columns={{ base: 2, md: 3 }} gap={4} my={6}>
      <Stat.Root>
        <Stat.Label>Elapsed Time</Stat.Label>
        <Stat.ValueText>
          {data.metrics.total_duration.toFixed(2)}s
        </Stat.ValueText>
      </Stat.Root>
      <Stat.Root>
        <Stat.Label>Total Spans</Stat.Label>
        <Stat.ValueText>{data.metrics.total_spans}</Stat.ValueText>
      </Stat.Root>
      <Stat.Root>
        <Stat.Label>LLM Calls</Stat.Label>
        <Stat.ValueText>{data.metrics.llm_call_count}</Stat.ValueText>
      </Stat.Root>
      <Stat.Root>
        <Stat.Label>Total Tokens</Stat.Label>
        <Stat.ValueText>
          {data.metrics.total_tokens.toLocaleString()}
        </Stat.ValueText>
      </Stat.Root>
      <Stat.Root>
        <Stat.Label>Avg Step Duration</Stat.Label>
        <Stat.ValueText>
          {data.metrics.avg_step_duration.toFixed(2)}s
        </Stat.ValueText>
      </Stat.Root>
      <Stat.Root>
        <Stat.Label>Max Depth</Stat.Label>
        <Stat.ValueText>{data.metrics.max_nesting_depth}</Stat.ValueText>
      </Stat.Root>
    </SimpleGrid>
  );
}

export function DurationChart() {
  const { data, loading } = useTraceData();
  if (loading || !data) return null;
  return <StackedBarChart data={data.buckets.aggregated} />;
}

export function CountChart() {
  const { data, loading } = useTraceData();
  if (loading || !data) return null;
  return <StackedBarChart data={data.buckets.span_counts} metric="count" />;
}

export function TimelineChart() {
  const { data, loading } = useTraceData();
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  if (loading || !data) return null;
  return (
    <>
      <GanttChart data={data.buckets.individual} onItemClick={setSelected} />
      <RecordInspector
        data={selected}
        keys={[
          "name",
          "type",
          "span_id",
          "duration",
          "tokens",
          "level",
          "parent_id",
          "attributes",
        ]}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

export function HierarchyChart() {
  const { data, loading } = useTraceData();
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  if (loading || !data) return null;
  return (
    <>
      <IcicleChart data={data.icicle} onNodeClick={setSelected} />
      <RecordInspector
        data={selected}
        keys={[
          "name",
          "layer",
          "duration",
          "tokens",
          "span_count",
          "attributes",
        ]}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
