import { UseTraceDataReturn, TraceData } from '@/types/traces';
import { useEffect, useState } from 'react';


export const useTraceData = (): UseTraceDataReturn => {
  const [data, setData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load consolidated files
        const [traceData, icicle] = await Promise.all([
          fetch('/data/trace-data.json').then(r => r.json()),
          fetch('/data/trace-icicle.json').then(r => r.json()),
        ]);

        setData({
          metrics: traceData.metrics,
          hierarchy: traceData.hierarchy,
          react: {}, // React features are embedded in the hierarchy now
          buckets: traceData.buckets,
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

