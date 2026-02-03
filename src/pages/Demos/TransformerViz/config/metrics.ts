/**
 * Metric definitions for TransformerViz
 * 
 * Each metric specifies visualization configuration and interpretation guidance.
 */

export interface MetricDefinition {
  value: string;
  label: string;
  description: string;
  interpretation: string;
  formula: string;
  colorScheme?: string;
  useNormalized?: boolean;  // Whether to use normalized column for this metric
}

export interface MetricCatalog {
  attention: MetricDefinition[];
  contribution: MetricDefinition[];
  hidden: MetricDefinition[];
  mlp: MetricDefinition[];
  mlpNeurons: MetricDefinition[];
  hiddenTrajectory: MetricDefinition[];
  layernorm: MetricDefinition[];
}

export const METRIC_CATALOG: MetricCatalog = {
  // Attention Head Metrics (fx: layer, x: head, y: token)
  attention: [
    {
      value: "entropy",
      label: "Entropy",
      description: "Attention distribution entropy",
      interpretation: "High = diffuse attention across many tokens, Low = focused on few tokens",
      formula: "-Σ p·log(p)",
      colorScheme: "viridis",
      useNormalized: false,
    },
    {
      value: "top1_mass",
      label: "Top-1 Mass",
      description: "Weight on most-attended position",
      interpretation: "High = single token dominates attention, Low = attention spread out",
      formula: "max(attention)",
      colorScheme: "viridis",
      useNormalized: false,
    },
    {
      value: "topk_mass",
      label: "Top-K Mass",
      description: "Weight on top-10 positions",
      interpretation: "High = attention concentrated on few tokens",
      formula: "Σ top-10 weights",
      colorScheme: "viridis",
      useNormalized: false,
    },
    {
      value: "diagonal_mass",
      label: "Diagonal Mass",
      description: "Self-attention weight",
      interpretation: "High = token attends to itself",
      formula: "attention[i,i]",
      colorScheme: "viridis",
      useNormalized: false,
    },
    {
      value: "band_mass",
      label: "Band Mass",
      description: "Local attention (±2 positions)",
      interpretation: "High = local/positional attention pattern",
      formula: "Σ attention[i-2:i+3]",
      colorScheme: "viridis",
      useNormalized: false,
    },
    {
      value: "score_sharpness",
      label: "Score Sharpness",
      description: "Pre-softmax score variance",
      interpretation: "High = confident attention decisions",
      formula: "var(scores)",
      colorScheme: "viridis",
      useNormalized: false,
    },
  ],
  // Head Contribution Metrics (fx: layer, x: head, y: token)
  contribution: [
    {
      value: "contrib_l2",
      label: "Contribution L2",
      description: "L2 norm of head output",
      interpretation: "Magnitude of head's contribution to residual stream",
      formula: "||head_output||₂",
      colorScheme: "blues",
      useNormalized: false,
    },
    {
      value: "contrib_to_argmax_logit",
      label: "Contribution to Argmax",
      description: "Dot product with argmax token",
      interpretation: "Positive = pushes toward predicted token, Negative = pushes away",
      formula: "head_output · W_U[argmax]",
      colorScheme: "rdbu",
      useNormalized: false,
    },
    {
      value: "contrib_to_argmax_logit_normed",
      label: "Contribution (Normed)",
      description: "Normalized contribution",
      interpretation: "Direction-only contribution, normalized by magnitudes",
      formula: "cosine(head_output, W_U[argmax])",
      colorScheme: "rdbu",
      useNormalized: false,
    },
  ],
  // Hidden State Metrics (x: layer, y: token)
  hidden: [
    {
      value: "hidden_norm",
      label: "Hidden Norm",
      description: "L2 norm of hidden state",
      interpretation: "Magnitude of representation - tends to grow through layers",
      formula: "||hidden||₂",
      colorScheme: "greens",
      useNormalized: true,  // Use hidden_norm_norm column
    },
    {
      value: "cosine_similarity_prev_layer",
      label: "Cosine Similarity",
      description: "Similarity to previous layer",
      interpretation: "High = small change from prev layer, Low = significant transformation",
      formula: "cos(h_l, h_{l-1})",
      colorScheme: "oranges",
      useNormalized: false,
    },
  ],
  // MLP Metrics (fx: stage [gate/up/down], x: layer, y: token)
  mlp: [
    {
      value: "l2_norm",
      label: "L2 Norm",
      description: "L2 norm of activation vector",
      interpretation: "Overall activation magnitude at this stage",
      formula: "||activations||₂",
      colorScheme: "inferno",
      useNormalized: true,  // Use l2_norm_norm column
    },
    {
      value: "sparsity",
      label: "Sparsity",
      description: "Fraction of activations > 0",
      interpretation: "How many neurons are active (after SiLU gating)",
      formula: "mean(x > 0)",
      colorScheme: "purples",
      useNormalized: false,
    },
    {
      value: "max_activation",
      label: "Max Activation",
      description: "Maximum activation value",
      interpretation: "Peak neuron activity - may indicate feature detection",
      formula: "max(activations)",
      colorScheme: "reds",
      useNormalized: true,  // Use max_activation_norm column
    },
    {
      value: "mean_activation",
      label: "Mean Activation",
      description: "Mean activation value",
      interpretation: "Average neuron activity level",
      formula: "mean(activations)",
      colorScheme: "oranges",
      useNormalized: true,  // Use mean_activation_norm column
    },
    {
      value: "topk_energy",
      label: "Top-K Energy",
      description: "Energy concentration in top-10",
      interpretation: "High = few neurons dominate, Low = distributed activity",
      formula: "Σ top-10² / Σ all²",
      colorScheme: "ylgnbu",
      useNormalized: false,
    },
  ],
  // MLP Neurons (top-k)
  mlpNeurons: [
    {
      value: "mlp_topk",
      label: "Top-K Neurons",
      description: "50 most active MLP neurons per token",
      interpretation: "Shows which neurons fire most strongly. X-axis ordered by activation magnitude.",
      formula: "top-50 by |activation|",
      colorScheme: "plasma",
      useNormalized: true,  // Use value_norm column
    },
  ],
  // Hidden Trajectory (top-k dimensions)
  hiddenTrajectory: [
    {
      value: "hidden_topk",
      label: "Hidden Trajectory",
      description: "50 most variable hidden dimensions across layers",
      interpretation: "Shows how token representations change. X-axis ordered by cross-layer variance.",
      formula: "top-50 by var(dim)",
      colorScheme: "cividis",
      useNormalized: true,  // Use value_norm column
    },
  ],
  // Layer Norm Metrics (fx: norm_type [input/post_attn], x: layer, y: token)
  layernorm: [
    {
      value: "norm_mean",
      label: "Norm Mean",
      description: "Pre-norm mean",
      interpretation: "Mean of activations before normalization",
      formula: "mean(x)",
      colorScheme: "piyg",
      useNormalized: true,  // Use mean_norm column
    },
    {
      value: "norm_variance",
      label: "Norm Variance",
      description: "Pre-norm variance",
      interpretation: "Spread of activations before normalization",
      formula: "var(x)",
      colorScheme: "rdylbu",
      useNormalized: true,  // Use variance_norm column
    },
  ],
} as const;

// Flat list of all metrics for dropdown
export const ALL_METRICS: MetricDefinition[] = [
  ...METRIC_CATALOG.attention,
  ...METRIC_CATALOG.contribution,
  ...METRIC_CATALOG.hidden,
  ...METRIC_CATALOG.mlp,
  ...METRIC_CATALOG.mlpNeurons,
  ...METRIC_CATALOG.hiddenTrajectory,
  ...METRIC_CATALOG.layernorm,
];

// Get metric info by value
export function getMetricInfo(metricValue: string): MetricDefinition | undefined {
  return ALL_METRICS.find(m => m.value === metricValue);
}

// Get metric category
export function getMetricCategory(metricValue: string): keyof MetricCatalog | null {
  if (METRIC_CATALOG.attention.some(m => m.value === metricValue)) return 'attention';
  if (METRIC_CATALOG.contribution.some(m => m.value === metricValue)) return 'contribution';
  if (METRIC_CATALOG.hidden.some(m => m.value === metricValue)) return 'hidden';
  if (METRIC_CATALOG.mlp.some(m => m.value === metricValue)) return 'mlp';
  if (METRIC_CATALOG.mlpNeurons.some(m => m.value === metricValue)) return 'mlpNeurons';
  if (METRIC_CATALOG.hiddenTrajectory.some(m => m.value === metricValue)) return 'hiddenTrajectory';
  if (METRIC_CATALOG.layernorm.some(m => m.value === metricValue)) return 'layernorm';
  return null;
}

// Check if metric has head dimension (needs fx faceting by layer)
export function isHeadMetric(metricValue: string): boolean {
  const category = getMetricCategory(metricValue);
  return category === 'attention' || category === 'contribution';
}
