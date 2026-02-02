/**
 * Interpretability helper functions for TransformerViz
 * 
 * Provides context-specific interpretations for metrics and layers.
 */

import { type MetricDefinition } from "../config/metrics";

/**
 * Analyze trend in values (increasing, decreasing, or stable)
 */
function analyzeTrend(values: number[]): "increasing" | "decreasing" | "stable" {
  if (values.length < 2) return "stable";
  
  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  
  const firstMean = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondMean = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  const diff = secondMean - firstMean;
  const threshold = Math.abs(firstMean) * 0.1; // 10% change threshold
  
  if (Math.abs(diff) < threshold) return "stable";
  return diff > 0 ? "increasing" : "decreasing";
}

/**
 * Get interpretation text for a token based on its metric values across layers
 */
export function getTokenInterpretation(
  metricInfo: MetricDefinition | undefined,
  values: number[]
): string {
  if (!metricInfo || values.length === 0) return "No data available";

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const trend = analyzeTrend(values);

  // Custom interpretations based on metric type
  switch (metricInfo.value) {
    case "entropy":
      if (mean > 3) {
        return "This token receives diffuse attention across many positions";
      } else if (mean > 2) {
        return "This token has moderate attention spread";
      } else {
        return "This token receives focused attention from specific positions";
      }
    
    case "hidden_norm":
      if (trend === "increasing") {
        return "Representation magnitude grows through layers (typical)";
      } else if (trend === "stable") {
        return "Representation magnitude is stable across layers";
      } else {
        return "Representation magnitude decreases through layers (unusual)";
      }
    
    case "contrib_to_argmax_logit":
      if (mean > 0) {
        return "Most heads push this token toward the predicted output";
      } else if (mean < 0) {
        return "Most heads push this token away from the predicted output";
      } else {
        return "Heads have mixed effects on the predicted output";
      }
    
    case "top1_mass":
      if (mean > 0.5) {
        return "Attention is highly concentrated on single positions";
      } else {
        return "Attention is distributed across multiple positions";
      }

    default:
      return `${metricInfo.interpretation} (Mean: ${mean.toFixed(2)}, Range: ${min.toFixed(2)} - ${max.toFixed(2)})`;
  }
}

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
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
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
