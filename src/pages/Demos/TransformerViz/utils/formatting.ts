/**
 * Formats numeric values with appropriate precision
 * - null/undefined/NaN: "-"
 * - Large values (>=1000): Scientific notation
 * - Very small values (<0.001, excluding 0): Scientific notation
 * - Other values: 3 decimal places
 */
export function formatValue(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v)) return "-";
  if (Math.abs(v) >= 1000) return v.toExponential(2);
  if (Math.abs(v) < 0.001 && v !== 0) return v.toExponential(2);
  return v.toFixed(3);
}

/**
 * Formats layer label with special cases for embedding and final layer
 * @param layer - Layer number (-1 for embedding, 36 for final in 36-layer model)
 * @param numLayers - Total number of layers (optional, used to detect final layer)
 */
export function formatLayerLabel(layer: number, numLayers?: number): string {
  if (layer === -1) return "Embed";
  if (numLayers && layer === numLayers) return "Final";
  return `Layer ${layer}`;
}
