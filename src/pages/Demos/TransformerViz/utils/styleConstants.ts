/**
 * Chart dimensions for detail panels
 * Token panel: vertical bar chart (layers on x, value on y) - needs room for 36 layer labels
 * Layer panel: horizontal bar chart (heads on y) - height scales with head count
 */
export const DETAIL_PANEL_CHART = {
  /** Token "Across Layers" bar chart - ~36 layers; use few x-ticks to avoid overlap */
  tokenAcrossLayers: {
    width: 300,
    height: 150,
    marginBottom: 28,
    marginLeft: 38,
    marginRight: 16,
    marginTop: 8,
    /** Approx number of x-axis ticks (layer labels) so 0-35 don't overlap */
    xTickCount: 10,
  },
  /** Layer "By Head" bar chart - min height, bar height in px */
  layerByHead: {
    width: 220,
    barHeight: 14,
    marginBottom: 12,
    marginLeft: 28,
    marginRight: 8,
    marginTop: 8,
  },
};

/**
 * Selection highlight styles for tokens and layers
 */
export const selectionStyles = {
  selected: {
    bg: "blue.subtle",
    borderColor: "accent",
    fontWeight: "semibold" as const,
  },
  unselected: {
    bg: "transparent",
    color: "fg",
  },
};

/**
 * Section title style for detail panels
 */
export const sectionTitleStyle = {
  fontSize: "xs" as const,
  fontWeight: "semibold" as const,
  color: "accentSubtle",
  mb: 2,
};
