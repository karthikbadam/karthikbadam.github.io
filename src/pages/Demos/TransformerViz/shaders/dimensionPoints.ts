/**
 * Custom GLSL shaders for dimension point cloud rendering.
 * 
 * Renders ~1M points representing output dimensions of attention and MLP tensors.
 * Each point's size is derived from sqrt(row_l2), color from row_p95_abs.
 */

export const dimensionPointsVertexShader = /* glsl */ `
  // Per-point attributes
  attribute float size;
  attribute vec3 customColor;
  attribute float pointId;
  
  // Uniforms
  uniform float uPointScale;
  uniform float uMinSize;
  uniform float uMaxSize;
  uniform float uOpacity;
  uniform vec3 uHighlightColor;
  uniform float uHighlightId;
  uniform float uHighlightRange;
  
  // Varyings to fragment shader
  varying vec3 vColor;
  varying float vOpacity;
  varying float vPointId;
  
  void main() {
    vPointId = pointId;
    
    // Transform to view space
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    
    // Calculate point size with distance attenuation
    float distanceScale = 300.0 / length(mvPosition.xyz);
    float scaledSize = size * uPointScale * distanceScale;
    gl_PointSize = clamp(scaledSize, uMinSize, uMaxSize);
    
    // Color and highlight logic
    float highlightDist = abs(pointId - uHighlightId);
    if (highlightDist < uHighlightRange) {
      // Highlighted point - use highlight color with full opacity
      vColor = mix(customColor, uHighlightColor, 0.7);
      vOpacity = 1.0;
    } else {
      vColor = customColor;
      vOpacity = uOpacity;
    }
    
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const dimensionPointsFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vOpacity;
  varying float vPointId;
  
  uniform float uGlowIntensity;
  
  void main() {
    // Circular point with soft edge
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    
    // Discard pixels outside circle
    if (dist > 0.5) discard;
    
    // Soft edge falloff
    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
    
    // Add subtle glow
    float glow = exp(-dist * 4.0) * uGlowIntensity;
    vec3 finalColor = vColor + vec3(glow);
    
    gl_FragColor = vec4(finalColor, alpha * vOpacity);
  }
`;

// Shader for GPU picking (render point IDs as colors)
export const pickingVertexShader = /* glsl */ `
  attribute float pointId;
  attribute float size;
  
  uniform float uPointScale;
  
  varying vec3 vIdColor;
  
  void main() {
    // Encode point ID as RGB color
    float id = pointId;
    float r = mod(id, 256.0) / 255.0;
    float g = mod(floor(id / 256.0), 256.0) / 255.0;
    float b = mod(floor(id / 65536.0), 256.0) / 255.0;
    vIdColor = vec3(r, g, b);
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float distanceScale = 300.0 / length(mvPosition.xyz);
    gl_PointSize = size * uPointScale * distanceScale;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const pickingFragmentShader = /* glsl */ `
  varying vec3 vIdColor;
  
  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    if (length(center) > 0.5) discard;
    gl_FragColor = vec4(vIdColor, 1.0);
  }
`;

// Color scales for different tensor types
export const COLOR_SCALES = {
  // Attention: Blue-Cyan gradient
  attention: {
    q: { low: [0.2, 0.4, 0.8], high: [0.4, 0.8, 1.0] },
    k: { low: [0.1, 0.5, 0.6], high: [0.2, 0.8, 0.9] },
    v: { low: [0.15, 0.45, 0.7], high: [0.3, 0.75, 0.95] },
    o: { low: [0.3, 0.3, 0.7], high: [0.5, 0.5, 1.0] },
  },
  // MLP: Orange-Amber gradient
  mlp: {
    gate: { low: [0.8, 0.5, 0.1], high: [1.0, 0.7, 0.2] },
    up: { low: [0.9, 0.6, 0.15], high: [1.0, 0.85, 0.3] },
    down: { low: [0.85, 0.4, 0.1], high: [1.0, 0.6, 0.2] },
  },
};

/**
 * Map a value to a color using linear interpolation between low and high.
 */
export function valueToColor(
  value: number,
  minVal: number,
  maxVal: number,
  colorScale: { low: number[]; high: number[] }
): [number, number, number] {
  const t = Math.max(0, Math.min(1, (value - minVal) / (maxVal - minVal)));
  return [
    colorScale.low[0] + t * (colorScale.high[0] - colorScale.low[0]),
    colorScale.low[1] + t * (colorScale.high[1] - colorScale.low[1]),
    colorScale.low[2] + t * (colorScale.high[2] - colorScale.low[2]),
  ];
}

/**
 * Map row_l2 to point size (sqrt scaling, clamped).
 */
export function rowL2ToSize(rowL2: number, maxRowL2: number): number {
  const normalized = Math.sqrt(rowL2 / maxRowL2);
  return 0.3 + normalized * 0.7; // Range [0.3, 1.0]
}

