/**
 * Calculate basic statistics from array of values
 */
export function calculateStats(values: number[] | undefined): {
  mean: number;
  std: number;
  max: number;
  min: number;
} {
  if (!values || values.length === 0) {
    return { mean: 0, std: 0, max: 0, min: 0 };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  const max = Math.max(...values);
  const min = Math.min(...values);

  return { mean, std, max, min };
}

/**
 * Format layer label for display
 */
export function formatLayerLabel(layer: number, numLayers?: number): string {
  if (layer === -1) return "Embedding";
  if (numLayers && layer === numLayers) return "Final";
  return `Layer ${layer}`;
}
