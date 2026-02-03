/**
 * Utility functions for Transformer architecture visualization.
 *
 * Provides layout calculations, color scales, and size functions
 * for rendering the 3D tower visualization.
 */

import * as THREE from "three";

// ============================================================================
// Layout Constants
// ============================================================================

/** Vertical spacing between layers */
export const LAYER_HEIGHT = 4.0;

/** Horizontal offset for attention cluster (left of spine) */
export const ATTENTION_OFFSET_X = -8.0;

/** Horizontal offset for MLP cluster (right of spine) */
export const MLP_OFFSET_X = 8.0;

/** Size of head discs */
export const HEAD_DISC_SIZE = 0.4;

/** Size of KV anchor discs (larger than head discs) */
export const KV_ANCHOR_SIZE = 0.6;

/** Size of spine disc */
export const SPINE_DISC_SIZE = 1.2;

/** Inner radius of norm rings */
export const NORM_RING_INNER = 1.4;

/** Outer radius of norm rings */
export const NORM_RING_OUTER = 1.7;

/** Base size for tensor tiles */
export const TILE_BASE_SIZE = 1.5;

/** Max size for tensor tiles */
export const TILE_MAX_SIZE = 3.0;

/** Head grid spacing */
export const HEAD_GRID_SPACING = 1.0;

/** KV anchor spacing */
export const KV_ANCHOR_SPACING = 1.5;

// ============================================================================
// Color Palettes
// ============================================================================

/** Attention family colors (blue-cyan) */
export const ATTENTION_COLORS = {
  q: new THREE.Color(0x3b82f6), // Blue
  k: new THREE.Color(0x06b6d4), // Cyan
  v: new THREE.Color(0x0ea5e9), // Sky
  o: new THREE.Color(0x6366f1), // Indigo
  head: new THREE.Color(0x60a5fa), // Light blue
  kv_anchor: new THREE.Color(0x8b5cf6), // Purple
};

/** MLP family colors (orange-amber) */
export const MLP_COLORS = {
  gate: new THREE.Color(0xf59e0b), // Amber
  up: new THREE.Color(0xfbbf24), // Yellow
  down: new THREE.Color(0xf97316), // Orange
};

/** Norm colors (teal accent) */
export const NORM_COLOR = new THREE.Color(0x14b8a6);

/** Spine color (neutral gray) */
export const SPINE_COLOR = new THREE.Color(0x6b7280);

/** Embedding/LM head color (white with outline) */
export const EMBED_COLOR = new THREE.Color(0xe5e7eb);

// ============================================================================
// Layout Functions
// ============================================================================

/**
 * Get the Y position for a layer in the tower.
 * Layer 0 is at the bottom, layer N-1 is at the top.
 */
export function getLayerY(layer: number, totalLayers: number): number {
  return (layer - totalLayers / 2) * LAYER_HEIGHT;
}

/**
 * Get the position of a spine disc for a layer.
 */
export function getSpinePosition(layer: number, totalLayers: number): THREE.Vector3 {
  return new THREE.Vector3(0, getLayerY(layer, totalLayers), 0);
}

/**
 * Get the position of a head disc in the 4x4 grid.
 * Heads are arranged in a 4x4 grid to the left of the spine.
 */
export function getHeadPosition(
  layer: number,
  head: number,
  totalLayers: number
): THREE.Vector3 {
  const row = Math.floor(head / 4);
  const col = head % 4;
  
  const gridCenterX = ATTENTION_OFFSET_X - 2;
  const gridCenterZ = 0;
  
  const x = gridCenterX + (col - 1.5) * HEAD_GRID_SPACING;
  const y = getLayerY(layer, totalLayers);
  const z = gridCenterZ + (row - 1.5) * HEAD_GRID_SPACING;
  
  return new THREE.Vector3(x, y, z);
}

/**
 * Get the position of a KV anchor disc.
 * KV anchors are arranged in a row below the head grid.
 */
export function getKVAnchorPosition(
  layer: number,
  kvGroup: number,
  totalLayers: number
): THREE.Vector3 {
  const gridCenterX = ATTENTION_OFFSET_X - 2;
  
  const x = gridCenterX + (kvGroup - 1.5) * KV_ANCHOR_SPACING;
  const y = getLayerY(layer, totalLayers);
  const z = 3.0; // Below the head grid
  
  return new THREE.Vector3(x, y, z);
}

/**
 * Get the position of an attention tensor tile (Q, K, V, O).
 * Arranged in a 2x2 grid.
 */
export function getAttentionTilePosition(
  layer: number,
  part: "q_proj" | "k_proj" | "v_proj" | "o_proj",
  totalLayers: number
): THREE.Vector3 {
  const tilePositions: Record<string, [number, number]> = {
    q_proj: [0, 0], // Top-left
    k_proj: [1, 0], // Top-right
    v_proj: [0, 1], // Bottom-left
    o_proj: [1, 1], // Bottom-right
  };
  
  const [col, row] = tilePositions[part];
  const gridCenterX = ATTENTION_OFFSET_X + 2;
  const gridCenterZ = 0;
  
  const x = gridCenterX + (col - 0.5) * 2.5;
  const y = getLayerY(layer, totalLayers);
  const z = gridCenterZ + (row - 0.5) * 2.5;
  
  return new THREE.Vector3(x, y, z);
}

/**
 * Get the position of an MLP tensor tile (gate, up, down).
 * Arranged in a triangle: gate and up at bottom, down at top.
 */
export function getMLPTilePosition(
  layer: number,
  part: "gate_proj" | "up_proj" | "down_proj",
  totalLayers: number
): THREE.Vector3 {
  const tilePositions: Record<string, [number, number]> = {
    gate_proj: [-1, 1], // Bottom-left
    up_proj: [1, 1],    // Bottom-right
    down_proj: [0, -1], // Top-center
  };
  
  const [xOffset, zOffset] = tilePositions[part];
  const gridCenterX = MLP_OFFSET_X;
  
  const x = gridCenterX + xOffset * 1.5;
  const y = getLayerY(layer, totalLayers);
  const z = zOffset * 1.5;
  
  return new THREE.Vector3(x, y, z);
}

/**
 * Get the position of a norm ring.
 */
export function getNormPosition(
  layer: number,
  part: "input_norm" | "post_norm",
  totalLayers: number
): THREE.Vector3 {
  const zOffset = part === "input_norm" ? -0.8 : 0.8;
  return new THREE.Vector3(0, getLayerY(layer, totalLayers), zOffset);
}

/**
 * Get the position of the embedding tile (at tower base).
 */
export function getEmbeddingPosition(totalLayers: number): THREE.Vector3 {
  return new THREE.Vector3(0, getLayerY(-1, totalLayers), 0);
}

/**
 * Get the position of the final norm ring (near top).
 */
export function getFinalNormPosition(totalLayers: number): THREE.Vector3 {
  return new THREE.Vector3(0, getLayerY(totalLayers, totalLayers), 0);
}

/**
 * Get the position of the LM head tile (near top).
 */
export function getLMHeadPosition(totalLayers: number): THREE.Vector3 {
  return new THREE.Vector3(0, getLayerY(totalLayers + 0.5, totalLayers), 0);
}

// ============================================================================
// Size Functions
// ============================================================================

/**
 * Calculate tile size based on parameter count.
 * Area ∝ sqrt(param_count), clamped to reasonable range.
 */
export function getTileSize(paramCount: number): number {
  // Normalize against typical large tensor (~4M params for attention, ~22M for MLP)
  const normalized = Math.sqrt(paramCount) / 2000;
  const clamped = Math.max(0.5, Math.min(normalized, 2.0));
  return TILE_BASE_SIZE * clamped;
}

/**
 * Calculate tile aspect ratio from shape.
 */
export function getTileAspect(shape0: number, shape1: number | null): number {
  if (!shape1) return 1;
  const ratio = shape0 / shape1;
  // Clamp aspect ratio to reasonable range
  return Math.max(0.25, Math.min(ratio, 4.0));
}

// ============================================================================
// Color Functions
// ============================================================================

/**
 * Get color for a tensor based on its part.
 */
export function getTensorColor(part: string): THREE.Color {
  switch (part) {
    case "q_proj":
      return ATTENTION_COLORS.q;
    case "k_proj":
      return ATTENTION_COLORS.k;
    case "v_proj":
      return ATTENTION_COLORS.v;
    case "o_proj":
      return ATTENTION_COLORS.o;
    case "gate_proj":
      return MLP_COLORS.gate;
    case "up_proj":
      return MLP_COLORS.up;
    case "down_proj":
      return MLP_COLORS.down;
    case "input_norm":
    case "post_norm":
    case "final_norm":
      return NORM_COLOR;
    case "embed_tokens":
    case "lm_head":
      return EMBED_COLOR;
    default:
      return SPINE_COLOR;
  }
}

/**
 * Map brightness value (fro_norm) to intensity (0-1).
 * Uses a normalized scale based on typical ranges.
 */
export function brightnessToIntensity(brightness: number, maxBrightness: number): number {
  if (maxBrightness === 0) return 0.5;
  const normalized = brightness / maxBrightness;
  // Apply sqrt scaling for better visual distribution
  return 0.3 + 0.7 * Math.sqrt(normalized);
}

/**
 * Apply intensity to a color (modulate brightness).
 */
export function applyIntensity(color: THREE.Color, intensity: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  // Modulate lightness based on intensity
  const newL = hsl.l * (0.5 + 0.5 * intensity);
  return new THREE.Color().setHSL(hsl.h, hsl.s, newL);
}

/**
 * Get color for head disc based on brightness.
 */
export function getHeadColor(brightness: number, maxBrightness: number): THREE.Color {
  const intensity = brightnessToIntensity(brightness, maxBrightness);
  return applyIntensity(ATTENTION_COLORS.head, intensity);
}

/**
 * Get color for KV anchor based on brightness.
 */
export function getKVColor(brightness: number, maxBrightness: number): THREE.Color {
  const intensity = brightnessToIntensity(brightness, maxBrightness);
  return applyIntensity(ATTENTION_COLORS.kv_anchor, intensity);
}

// ============================================================================
// Highlight / Spotlight Functions
// ============================================================================

/** Default opacity for unhighlighted elements */
export const DEFAULT_OPACITY = 0.8;

/** Dimmed opacity for spotlighted elements */
export const DIM_OPACITY = 0.15;

/** Highlighted opacity */
export const HIGHLIGHT_OPACITY = 1.0;

/**
 * Calculate opacity based on spotlight state.
 */
export function getSpotlightOpacity(
  isSpotlighted: boolean,
  isHighlighted: boolean,
  hasSpotlight: boolean
): number {
  if (!hasSpotlight) return DEFAULT_OPACITY;
  if (isSpotlighted || isHighlighted) return HIGHLIGHT_OPACITY;
  return DIM_OPACITY;
}

// ============================================================================
// Geometry Helpers
// ============================================================================

/**
 * Create a rounded rectangle shape for tiles.
 */
export function createRoundedRectShape(
  width: number,
  height: number,
  radius: number
): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  
  return shape;
}

/**
 * Create a torus geometry for norm rings.
 */
export function createNormRingGeometry(): THREE.TorusGeometry {
  return new THREE.TorusGeometry(
    (NORM_RING_INNER + NORM_RING_OUTER) / 2,
    (NORM_RING_OUTER - NORM_RING_INNER) / 2,
    8,
    32
  );
}

/**
 * Create a flat disc geometry.
 */
export function createDiscGeometry(radius: number): THREE.CircleGeometry {
  return new THREE.CircleGeometry(radius, 32);
}

// ============================================================================
// Camera Helpers
// ============================================================================

/**
 * Calculate initial camera position to view the full tower.
 */
export function getInitialCameraPosition(totalLayers: number): THREE.Vector3 {
  const towerHeight = totalLayers * LAYER_HEIGHT;
  const distance = Math.max(towerHeight * 0.8, 60);
  return new THREE.Vector3(distance * 0.7, towerHeight * 0.3, distance * 0.7);
}

/**
 * Calculate camera target (center of tower).
 */
export function getCameraTarget(_totalLayers: number): THREE.Vector3 {
  return new THREE.Vector3(0, 0, 0);
}

