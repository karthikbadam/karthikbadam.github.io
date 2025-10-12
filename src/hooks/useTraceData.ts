import { useEffect, useState } from 'react';

export interface TraceMetrics {
  total_duration: number;  // Actual elapsed time
  sum_of_durations: number;  // Sum of all span durations (includes overlaps)
  step_count: number;
  llm_call_count: number;
  total_tokens: number;
  avg_step_duration: number;
  max_nesting_depth: number;
  trace_id: string;
  total_spans: number;
}

export interface SpanData {
  span_id: string;
  parent_id: string | null;
  name: string;
  type: string;
  level: number;
  parent_name: string | null;
  start: number;
  duration: number;
  tokens?: number;
  attributes: Record<string, any>;
  has_children: boolean;
  child_count: number;
  children: SpanData[];
}

export interface TraceHierarchy {
  roots: SpanData[];
  span_map: Record<string, Omit<SpanData, 'children'>>;
}

export interface ReActFeatures {
  [span_id: string]: {
    has_thought: boolean;
    has_code: boolean;
    has_tool_call: boolean;
    message_count: number;
  };
}

export interface BucketSpan {
  span_id: string;
  name: string;
  type: string;
  duration: number;
  full_duration: number;
  start_offset: number;
  start_time: number;
}

export interface TimeBucket {
  bucket_index: number;
  bucket_start: number;
  bucket_end: number;
  spans: BucketSpan[];
}

export interface AggregatedBucket {
  bucket_index: number;
  bucket_start: number;
  bucket_end: number;
  by_type: Record<string, number>;
}

export interface BucketData {
  aggregated: AggregatedBucket[];
  individual: TimeBucket[];
  bucket_size: number;
  min_start: number;
  max_end: number;
}

export interface IcicleNode {
  name: string;
  layer: number;
  attributes: {
    duration?: number;
    tokens?: number;
    [key: string]: any;
  };
  children?: IcicleNode[];
}

export interface TraceData {
  metrics: TraceMetrics;
  hierarchy: TraceHierarchy;
  react: ReActFeatures;
  buckets: BucketData;
  icicle: IcicleNode;
}

export interface UseTraceDataReturn {
  data: TraceData | null;
  loading: boolean;
  error: string | null;
}

export const useTraceData = (): UseTraceDataReturn => {
  const [data, setData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [metrics, hierarchy, react, buckets, icicle] = await Promise.all([
          fetch('/data/trace-metrics.json').then(r => r.json()),
          fetch('/data/trace-hierarchy.json').then(r => r.json()),
          fetch('/data/trace-react-features.json').then(r => r.json()),
          fetch('/data/trace-buckets.json').then(r => r.json()),
          fetch('/data/trace-icicle.json').then(r => r.json()),
        ]);

        setData({
          metrics,
          hierarchy,
          react,
          buckets,
          icicle,
        });
      } catch (err) {
        console.error('Error loading trace data:', err);
        setError('Failed to load trace data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return { data, loading, error };
};

