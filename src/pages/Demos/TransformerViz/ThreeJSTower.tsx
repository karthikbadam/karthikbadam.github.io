import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Box, Text, Spinner } from "@chakra-ui/react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useTransformer } from "../../../contexts/TransformerContext";
import {
  dimensionPointsVertexShader,
  dimensionPointsFragmentShader,
  rowL2ToSize,
} from "./shaders/dimensionPoints";
import type { HeadAggregate, KVAggregate, TensorDim } from "../../../types/transformer";

// Layout constants
const LAYER_HEIGHT = 3.5;
const ATTENTION_OFFSET_X = -12.0;
const MLP_OFFSET_X = 12.0;
const HEAD_GRID_SPACING = 1.2;
const KV_ANCHOR_SPACING = 1.8;
const KV_ANCHOR_Z = 4;
const HEAD_DIM_RADIUS = 1.2;
const KV_DIM_RADIUS = 0.8;
const O_DIM_RADIUS = 1.5;

// Tensor tile positions relative to ATTENTION_OFFSET_X
const Q_TILE_POS = { x: 3, z: -1.5 };
const K_TILE_POS = { x: 5, z: -1.5 };
const V_TILE_POS = { x: 3, z: 1.5 };
const O_TILE_POS = { x: 5, z: 1.5 };

// MLP tile positions relative to MLP_OFFSET_X
const GATE_TILE_POS = { x: -1.5, z: 1.5 };
const UP_TILE_POS = { x: 1.5, z: 1.5 };
const DOWN_TILE_POS = { x: 0, z: -1.5 };

export interface HoverInfo {
  type: "head" | "kv" | "dim" | "tensor" | "layer" | null;
  layer?: number;
  head?: number;
  kvGroup?: number;
  dim?: number;
  tensorId?: string;
  role?: string;
  value?: number;
  zScore?: number;
}

interface ThreeJSTowerProps {
  onHover?: (info: HoverInfo | null) => void;
}

// All attention dim types
interface AttentionDimData {
  qDims: TensorDim[];
  kDims: TensorDim[];
  vDims: TensorDim[];
  oDims: TensorDim[];
}

// All MLP dim types
interface MLPDimData {
  downDims: TensorDim[];
  upDims: TensorDim[];
  gateDims: TensorDim[];
}

export function ThreeJSTower({ onHover }: ThreeJSTowerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef = useRef<number>(0);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Point cloud refs
  const attentionPointsRef = useRef<THREE.Points | null>(null);
  const mlpPointsRef = useRef<THREE.Points | null>(null);

  const {
    state,
    numLayers,
    numHeads,
    numKVHeads,
    headDim,
    hiddenSize,
    intermediateSize,
    headAggregates,
    kvAggregates,
    queryDimsForLayer,
  } = useTransformer();

  const [isBuilding, setIsBuilding] = useState(false);
  const [attentionData, setAttentionData] = useState<AttentionDimData | null>(null);
  const [mlpData, setMlpData] = useState<MLPDimData | null>(null);
  const [allAttentionDims, setAllAttentionDims] = useState<TensorDim[]>([]);
  const [allMlpDims, setAllMlpDims] = useState<TensorDim[]>([]);

  // Z-score statistics for diverging colors
  const [attentionStats, setAttentionStats] = useState<{ mean: number; std: number } | null>(null);
  const [mlpStats, setMlpStats] = useState<{ mean: number; std: number } | null>(null);

  // Compute max values for normalization
  const maxHeadL2 = useMemo(() => {
    if (headAggregates.length === 0) return 1;
    return Math.max(...headAggregates.map((h) => h.total_l2));
  }, [headAggregates]);

  const maxKVL2 = useMemo(() => {
    if (kvAggregates.length === 0) return 1;
    return Math.max(...kvAggregates.map((k) => k.combined_l2));
  }, [kvAggregates]);

  // Create lookup maps
  const headAggMap = useMemo(() => {
    const map = new Map<string, HeadAggregate>();
    headAggregates.forEach((h) => map.set(`${h.layer}-${h.head}`, h));
    return map;
  }, [headAggregates]);

  const kvAggMap = useMemo(() => {
    const map = new Map<string, KVAggregate>();
    kvAggregates.forEach((k) => map.set(`${k.layer}-${k.kv_head}`, k));
    return map;
  }, [kvAggregates]);

  const headsPerKV = useMemo(() => numHeads / numKVHeads, [numHeads, numKVHeads]);

  // Load ALL dimension data for point clouds
  useEffect(() => {
    if (state.status !== "ready") return;

    const loadDims = async () => {
      setIsBuilding(true);

      // Load attention dims: Q, K, V, O
      const allQ: TensorDim[] = [];
      const allK: TensorDim[] = [];
      const allV: TensorDim[] = [];
      const allO: TensorDim[] = [];

      for (let layer = 0; layer < numLayers; layer++) {
        const [qDims, kDims, vDims, oDims] = await Promise.all([
          queryDimsForLayer(layer, "q"),
          queryDimsForLayer(layer, "k"),
          queryDimsForLayer(layer, "v"),
          queryDimsForLayer(layer, "o"),
        ]);
        allQ.push(...qDims);
        allK.push(...kDims);
        allV.push(...vDims);
        allO.push(...oDims);
      }

      setAttentionData({ qDims: allQ, kDims: allK, vDims: allV, oDims: allO });
      const allAttn = [...allQ, ...allK, ...allV, ...allO];
      setAllAttentionDims(allAttn);

      // Compute attention stats for z-scores
      if (allAttn.length > 0) {
        const l2Values = allAttn.map((d) => d.row_l2);
        const mean = l2Values.reduce((a, b) => a + b, 0) / l2Values.length;
        const variance = l2Values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / l2Values.length;
        const std = Math.sqrt(variance);
        setAttentionStats({ mean, std });
      }

      // Load MLP dims: down, up, gate
      const allDown: TensorDim[] = [];
      const allUp: TensorDim[] = [];
      const allGate: TensorDim[] = [];

      for (let layer = 0; layer < numLayers; layer++) {
        const [downDims, upDims, gateDims] = await Promise.all([
          queryDimsForLayer(layer, "down"),
          queryDimsForLayer(layer, "up"),
          queryDimsForLayer(layer, "gate"),
        ]);
        allDown.push(...downDims);
        allUp.push(...upDims);
        allGate.push(...gateDims);
      }

      setMlpData({ downDims: allDown, upDims: allUp, gateDims: allGate });
      const allMlp = [...allDown, ...allUp, ...allGate];
      setAllMlpDims(allMlp);

      // Compute MLP stats for z-scores
      if (allMlp.length > 0) {
        const l2Values = allMlp.map((d) => d.row_l2);
        const mean = l2Values.reduce((a, b) => a + b, 0) / l2Values.length;
        const variance = l2Values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / l2Values.length;
        const std = Math.sqrt(variance);
        setMlpStats({ mean, std });
      }

      setIsBuilding(false);
    };

    loadDims();
  }, [state.status, numLayers, queryDimsForLayer]);

  // Get layer Y position
  const getLayerY = useCallback(
    (layer: number) => (layer - numLayers / 2) * LAYER_HEIGHT,
    [numLayers]
  );

  // Get head position
  const getHeadPosition = useCallback(
    (layer: number, head: number): [number, number, number] => {
      const row = Math.floor(head / 4);
      const col = head % 4;
      const x = ATTENTION_OFFSET_X - 2 + (col - 1.5) * HEAD_GRID_SPACING;
      const y = getLayerY(layer);
      const z = (row - 1.5) * HEAD_GRID_SPACING;
      return [x, y, z];
    },
    [getLayerY]
  );

  // Get KV anchor position
  const getKVPosition = useCallback(
    (layer: number, kv: number): [number, number, number] => {
      const x = ATTENTION_OFFSET_X - 2 + (kv - 1.5) * KV_ANCHOR_SPACING;
      const y = getLayerY(layer);
      const z = KV_ANCHOR_Z;
      return [x, y, z];
    },
    [getLayerY]
  );

  // Convert z-score to diverging color (blue-white-red)
  const zScoreToColor = useCallback((z: number): [number, number, number] => {
    const t = Math.max(-1, Math.min(1, z / 3));
    if (t < 0) {
      const factor = -t;
      return [0.2 + 0.75 * (1 - factor), 0.4 + 0.55 * (1 - factor), 0.9 + 0.05 * (1 - factor)];
    } else {
      const factor = t;
      return [0.95 - 0.05 * (1 - factor), 0.95 - 0.65 * factor, 0.95 - 0.75 * factor];
    }
  }, []);

  // Build GQA links (head → KV anchor)
  const buildGQALinks = useCallback(
    (scene: THREE.Scene) => {
      const positions: number[] = [];
      const colors: number[] = [];
      const linkColor = new THREE.Color(0x6b4fb8);

      for (let layer = 0; layer < numLayers; layer++) {
        for (let head = 0; head < numHeads; head++) {
          const kvGroup = Math.floor(head / headsPerKV);
          const [hx, hy, hz] = getHeadPosition(layer, head);
          const [kx, ky, kz] = getKVPosition(layer, kvGroup);
          positions.push(hx, hy, hz, kx, ky, kz);
          colors.push(linkColor.r, linkColor.g, linkColor.b, linkColor.r, linkColor.g, linkColor.b);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const material = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 1 });
      const lines = new THREE.LineSegments(geometry, material);
      scene.add(lines);
    },
    [numLayers, numHeads, headsPerKV, getHeadPosition, getKVPosition]
  );

  // Build dataflow links (spine → norm → attention → MLP)
  const buildDataflowLinks = useCallback(
    (scene: THREE.Scene) => {
      const positions: number[] = [];
      const colors: number[] = [];
      const dataflowColor = new THREE.Color(0x4a5568); // Gray

      for (let layer = 0; layer < numLayers; layer++) {
        const y = getLayerY(layer);
        
        // Spine disc to input norm
        positions.push(0, y, 0, 0, y, -0.6);
        colors.push(dataflowColor.r, dataflowColor.g, dataflowColor.b, dataflowColor.r, dataflowColor.g, dataflowColor.b);
        
        // Input norm to Q tile
        positions.push(0, y, -0.6, ATTENTION_OFFSET_X + Q_TILE_POS.x, y, Q_TILE_POS.z);
        colors.push(dataflowColor.r, dataflowColor.g, dataflowColor.b, dataflowColor.r, dataflowColor.g, dataflowColor.b);
        
        // Input norm to K tile
        positions.push(0, y, -0.6, ATTENTION_OFFSET_X + K_TILE_POS.x, y, K_TILE_POS.z);
        colors.push(dataflowColor.r, dataflowColor.g, dataflowColor.b, dataflowColor.r, dataflowColor.g, dataflowColor.b);
        
        // Input norm to V tile
        positions.push(0, y, -0.6, ATTENTION_OFFSET_X + V_TILE_POS.x, y, V_TILE_POS.z);
        colors.push(dataflowColor.r, dataflowColor.g, dataflowColor.b, dataflowColor.r, dataflowColor.g, dataflowColor.b);
        
        // Head grid center to O tile
        const headCenterX = ATTENTION_OFFSET_X - 2;
        positions.push(headCenterX, y, 0, ATTENTION_OFFSET_X + O_TILE_POS.x, y, O_TILE_POS.z);
        colors.push(dataflowColor.r, dataflowColor.g, dataflowColor.b, dataflowColor.r, dataflowColor.g, dataflowColor.b);
        
        // Post norm to gate tile
        positions.push(0, y, 0.6, MLP_OFFSET_X + GATE_TILE_POS.x, y, GATE_TILE_POS.z);
        colors.push(dataflowColor.r, dataflowColor.g, dataflowColor.b, dataflowColor.r, dataflowColor.g, dataflowColor.b);
        
        // Post norm to up tile
        positions.push(0, y, 0.6, MLP_OFFSET_X + UP_TILE_POS.x, y, UP_TILE_POS.z);
        colors.push(dataflowColor.r, dataflowColor.g, dataflowColor.b, dataflowColor.r, dataflowColor.g, dataflowColor.b);
        
        // Gate/up to down tile
        positions.push(MLP_OFFSET_X + GATE_TILE_POS.x, y, GATE_TILE_POS.z, MLP_OFFSET_X + DOWN_TILE_POS.x, y, DOWN_TILE_POS.z);
        colors.push(dataflowColor.r, dataflowColor.g, dataflowColor.b, dataflowColor.r, dataflowColor.g, dataflowColor.b);
        positions.push(MLP_OFFSET_X + UP_TILE_POS.x, y, UP_TILE_POS.z, MLP_OFFSET_X + DOWN_TILE_POS.x, y, DOWN_TILE_POS.z);
        colors.push(dataflowColor.r, dataflowColor.g, dataflowColor.b, dataflowColor.r, dataflowColor.g, dataflowColor.b);
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const material = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 1 });
      const lines = new THREE.LineSegments(geometry, material);
      scene.add(lines);
    },
    [numLayers, getLayerY]
  );

  // Build residual links (attention/MLP outputs → spine)
  const buildResidualLinks = useCallback(
    (scene: THREE.Scene) => {
      const positions: number[] = [];
      const colors: number[] = [];
      const residualColor = new THREE.Color(0x48bb78); // Green

      for (let layer = 0; layer < numLayers; layer++) {
        const y = getLayerY(layer);
        
        // O tile to spine (attention residual)
        positions.push(ATTENTION_OFFSET_X + O_TILE_POS.x, y, O_TILE_POS.z, 0, y, 0);
        colors.push(residualColor.r, residualColor.g, residualColor.b, residualColor.r, residualColor.g, residualColor.b);
        
        // Down tile to spine (MLP residual)
        positions.push(MLP_OFFSET_X + DOWN_TILE_POS.x, y, DOWN_TILE_POS.z, 0, y, 0);
        colors.push(residualColor.r, residualColor.g, residualColor.b, residualColor.r, residualColor.g, residualColor.b);
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const material = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 1 });
      const lines = new THREE.LineSegments(geometry, material);
      scene.add(lines);
    },
    [numLayers, getLayerY]
  );

  // Build tensor-to-head links (Q→heads, K/V→KV anchors)
  const buildTensorToHeadLinks = useCallback(
    (scene: THREE.Scene) => {
      const positions: number[] = [];
      const colors: number[] = [];
      const tensorHeadColor = new THREE.Color(0x63b3ed); // Cyan

      for (let layer = 0; layer < numLayers; layer++) {
        const y = getLayerY(layer);
        
        // Q tile to each head
        for (let head = 0; head < numHeads; head++) {
          const [hx, , hz] = getHeadPosition(layer, head);
          positions.push(ATTENTION_OFFSET_X + Q_TILE_POS.x, y, Q_TILE_POS.z, hx, y, hz);
          colors.push(tensorHeadColor.r, tensorHeadColor.g, tensorHeadColor.b, tensorHeadColor.r, tensorHeadColor.g, tensorHeadColor.b);
        }
        
        // K tile to each KV anchor
        for (let kv = 0; kv < numKVHeads; kv++) {
          const [kx, , kz] = getKVPosition(layer, kv);
          positions.push(ATTENTION_OFFSET_X + K_TILE_POS.x, y, K_TILE_POS.z, kx, y, kz);
          colors.push(tensorHeadColor.r, tensorHeadColor.g, tensorHeadColor.b, tensorHeadColor.r, tensorHeadColor.g, tensorHeadColor.b);
        }
        
        // V tile to each KV anchor
        for (let kv = 0; kv < numKVHeads; kv++) {
          const [kx, , kz] = getKVPosition(layer, kv);
          positions.push(ATTENTION_OFFSET_X + V_TILE_POS.x, y, V_TILE_POS.z, kx, y, kz);
          colors.push(tensorHeadColor.r, tensorHeadColor.g, tensorHeadColor.b, tensorHeadColor.r, tensorHeadColor.g, tensorHeadColor.b);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const material = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 1 });
      const lines = new THREE.LineSegments(geometry, material);
      scene.add(lines);
    },
    [numLayers, numHeads, numKVHeads, getLayerY, getHeadPosition, getKVPosition]
  );

  // Build static structure (spine, norms, tensor tiles, head spheres)
  const buildStaticStructure = useCallback(
    (scene: THREE.Scene) => {
      // Spine rail
      const spineGeometry = new THREE.CylinderGeometry(0.2, 0.2, numLayers * LAYER_HEIGHT + 10, 16);
      const spineMaterial = new THREE.MeshStandardMaterial({
        color: 0x4b5563,
        transparent: true,
        opacity: 0.5,
      });
      const spine = new THREE.Mesh(spineGeometry, spineMaterial);
      scene.add(spine);

      // Per-layer structures
      for (let layer = 0; layer < numLayers; layer++) {
        const y = getLayerY(layer);

        // Spine disc
        const discGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.15, 32);
        const discMaterial = new THREE.MeshStandardMaterial({ color: 0x6b7280 });
        const disc = new THREE.Mesh(discGeometry, discMaterial);
        disc.position.set(0, y, 0);
        scene.add(disc);

        // Norm rings (teal)
        const normGeometry = new THREE.TorusGeometry(1.2, 0.08, 8, 32);
        const normMaterial = new THREE.MeshStandardMaterial({
          color: 0x14b8a6,
          transparent: true,
          opacity: 0.7,
        });

        const inputNorm = new THREE.Mesh(normGeometry, normMaterial);
        inputNorm.position.set(0, y, -0.6);
        inputNorm.rotation.x = Math.PI / 2;
        scene.add(inputNorm);

        const postNorm = new THREE.Mesh(normGeometry, normMaterial);
        postNorm.position.set(0, y, 0.6);
        postNorm.rotation.x = Math.PI / 2;
        scene.add(postNorm);

        // Attention tensor tiles (Q, K, V, O)
        const tileGeometry = new THREE.BoxGeometry(1.5, 0.2, 1.2);
        const qMaterial = new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.85 });
        const kMaterial = new THREE.MeshStandardMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.85 });
        const vMaterial = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.85 });
        const oMaterial = new THREE.MeshStandardMaterial({ color: 0x6366f1, transparent: true, opacity: 0.85 });

        const smallTileGeometry = new THREE.BoxGeometry(1.0, 0.2, 0.8);

        const qTile = new THREE.Mesh(tileGeometry, qMaterial);
        qTile.position.set(ATTENTION_OFFSET_X + Q_TILE_POS.x, y, Q_TILE_POS.z);
        scene.add(qTile);

        const kTile = new THREE.Mesh(smallTileGeometry, kMaterial);
        kTile.position.set(ATTENTION_OFFSET_X + K_TILE_POS.x, y, K_TILE_POS.z);
        scene.add(kTile);

        const vTile = new THREE.Mesh(smallTileGeometry, vMaterial);
        vTile.position.set(ATTENTION_OFFSET_X + V_TILE_POS.x, y, V_TILE_POS.z);
        scene.add(vTile);

        const oTile = new THREE.Mesh(tileGeometry, oMaterial);
        oTile.position.set(ATTENTION_OFFSET_X + O_TILE_POS.x, y, O_TILE_POS.z);
        scene.add(oTile);

        // Head spheres (16 per layer) in 4x4 grid
        const headGeometry = new THREE.SphereGeometry(0.35, 16, 16);
        for (let head = 0; head < numHeads; head++) {
          const [x, , z] = getHeadPosition(layer, head);
          const agg = headAggMap.get(`${layer}-${head}`);
          const intensity = agg ? agg.total_l2 / maxHeadL2 : 0.5;
          const color = new THREE.Color().setHSL(0.6, 0.7, 0.3 + intensity * 0.4);
          const headMaterial = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.9 });
          const headSphere = new THREE.Mesh(headGeometry, headMaterial);
          headSphere.position.set(x, y, z);
          scene.add(headSphere);
        }

        // KV anchor spheres (4 per layer)
        const kvGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        for (let kv = 0; kv < numKVHeads; kv++) {
          const [x, , z] = getKVPosition(layer, kv);
          const agg = kvAggMap.get(`${layer}-${kv}`);
          const intensity = agg ? agg.combined_l2 / maxKVL2 : 0.5;
          const color = new THREE.Color().setHSL(0.75, 0.7, 0.3 + intensity * 0.4);
          const kvMaterial = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.9 });
          const kvSphere = new THREE.Mesh(kvGeometry, kvMaterial);
          kvSphere.position.set(x, y, z);
          scene.add(kvSphere);
        }

        // MLP tensor tiles (gate, up, down)
        const gateMaterial = new THREE.MeshStandardMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 });
        const upMaterial = new THREE.MeshStandardMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.85 });
        const downMaterial = new THREE.MeshStandardMaterial({ color: 0xf97316, transparent: true, opacity: 0.85 });

        const mlpTileGeometry = new THREE.BoxGeometry(2.0, 0.2, 1.0);

        const gateTile = new THREE.Mesh(mlpTileGeometry, gateMaterial);
        gateTile.position.set(MLP_OFFSET_X + GATE_TILE_POS.x, y, GATE_TILE_POS.z);
        scene.add(gateTile);

        const upTile = new THREE.Mesh(mlpTileGeometry, upMaterial);
        upTile.position.set(MLP_OFFSET_X + UP_TILE_POS.x, y, UP_TILE_POS.z);
        scene.add(upTile);

        const downTile = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 2.0), downMaterial);
        downTile.position.set(MLP_OFFSET_X + DOWN_TILE_POS.x, y, DOWN_TILE_POS.z);
        scene.add(downTile);
      }

      // Embedding tile at bottom
      const embedGeometry = new THREE.BoxGeometry(3, 0.3, 3);
      const embedMaterial = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, transparent: true, opacity: 0.9 });
      const embedTile = new THREE.Mesh(embedGeometry, embedMaterial);
      embedTile.position.set(0, getLayerY(-1.5), 0);
      scene.add(embedTile);

      // Final norm ring
      const finalNormGeometry = new THREE.TorusGeometry(1.5, 0.1, 8, 32);
      const finalNormMaterial = new THREE.MeshStandardMaterial({ color: 0x14b8a6, transparent: true, opacity: 0.8 });
      const finalNorm = new THREE.Mesh(finalNormGeometry, finalNormMaterial);
      finalNorm.position.set(0, getLayerY(numLayers), 0);
      finalNorm.rotation.x = Math.PI / 2;
      scene.add(finalNorm);

      // LM head tile (wireframe to show tied)
      const lmHeadMaterial = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, transparent: true, opacity: 0.4, wireframe: true });
      const lmHeadTile = new THREE.Mesh(embedGeometry, lmHeadMaterial);
      lmHeadTile.position.set(0, getLayerY(numLayers + 0.5), 0);
      scene.add(lmHeadTile);
    },
    [numLayers, numHeads, numKVHeads, getLayerY, getHeadPosition, getKVPosition, headAggMap, kvAggMap, maxHeadL2, maxKVL2]
  );

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current || state.status !== "ready") return;

    const container = containerRef.current;
    const { clientWidth: width, clientHeight: height } = container;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a14);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    const towerHeight = numLayers * LAYER_HEIGHT;
    camera.position.set(towerHeight * 0.6, towerHeight * 0.3, towerHeight * 0.6);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 20;
    controls.maxDistance = 300;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    scene.add(directionalLight);

    // Build static tower structure
    buildStaticStructure(scene);

    // Build all links
    buildDataflowLinks(scene);
    buildResidualLinks(scene);
    buildTensorToHeadLinks(scene);
    buildGQALinks(scene);

    // Animation loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      const { clientWidth: w, clientHeight: h } = container;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Mouse move handler for hover
    const handleMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      // Check attention points
      if (attentionPointsRef.current) {
        const intersects = raycasterRef.current.intersectObject(attentionPointsRef.current);
        if (intersects.length > 0) {
          const idx = intersects[0].index;
          if (idx !== undefined && allAttentionDims[idx]) {
            const dim = allAttentionDims[idx];
            const zScore = attentionStats ? (dim.row_l2 - attentionStats.mean) / attentionStats.std : 0;
            const info: HoverInfo = {
              type: "dim",
              layer: dim.layer,
              head: dim.head ?? undefined,
              dim: dim.dim,
              tensorId: dim.tensor_id,
              role: dim.role,
              value: dim.row_l2,
              zScore,
            };
            onHover?.(info);
            return;
          }
        }
      }

      // Check MLP points
      if (mlpPointsRef.current) {
        const intersects = raycasterRef.current.intersectObject(mlpPointsRef.current);
        if (intersects.length > 0) {
          const idx = intersects[0].index;
          if (idx !== undefined && allMlpDims[idx]) {
            const dim = allMlpDims[idx];
            const zScore = mlpStats ? (dim.row_l2 - mlpStats.mean) / mlpStats.std : 0;
            const info: HoverInfo = {
              type: "dim",
              layer: dim.layer,
              dim: dim.dim,
              tensorId: dim.tensor_id,
              role: dim.role,
              value: dim.row_l2,
              zScore,
            };
            onHover?.(info);
            return;
          }
        }
      }

      onHover?.(null);
    };

    container.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(frameRef.current);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [
    state.status,
    numLayers,
    getLayerY,
    allAttentionDims,
    allMlpDims,
    attentionStats,
    mlpStats,
    onHover,
    buildStaticStructure,
    buildGQALinks,
    buildDataflowLinks,
    buildResidualLinks,
    buildTensorToHeadLinks,
  ]);

  // Build attention dimension point clouds (Q, K, V, O) with diverging colors
  useEffect(() => {
    if (!sceneRef.current || !attentionData || !attentionStats) return;

    const scene = sceneRef.current;

    // Remove old points
    if (attentionPointsRef.current) {
      scene.remove(attentionPointsRef.current);
      attentionPointsRef.current.geometry.dispose();
      (attentionPointsRef.current.material as THREE.Material).dispose();
    }

    // Compute max using reduce (avoid stack overflow with large arrays)
    let maxRowL2 = 0;
    for (let i = 0; i < allAttentionDims.length; i++) {
      if (allAttentionDims[i].row_l2 > maxRowL2) maxRowL2 = allAttentionDims[i].row_l2;
    }
    if (maxRowL2 === 0) maxRowL2 = 1;

    const positions: number[] = [];
    const sizes: number[] = [];
    const colors: number[] = [];
    const pointIds: number[] = [];

    let globalIdx = 0;

    // Q dims: ring around each head
    for (let i = 0; i < attentionData.qDims.length; i++) {
      const dim = attentionData.qDims[i];
      const layer = dim.layer;
      const head = dim.head ?? 0;
      const dimIdx = dim.dim;

      const [headX, , headZ] = getHeadPosition(layer, head);
      const y = getLayerY(layer);
      const angle = (dimIdx / headDim) * Math.PI * 2;
      const x = headX + Math.cos(angle) * HEAD_DIM_RADIUS;
      const z = headZ + Math.sin(angle) * HEAD_DIM_RADIUS;

      positions.push(x, y, z);
      sizes.push(rowL2ToSize(dim.row_l2, maxRowL2) * 0.5);
      const zScore = (dim.row_l2 - attentionStats.mean) / attentionStats.std;
      const [r, g, b] = zScoreToColor(zScore);
      colors.push(r, g, b);
      pointIds.push(globalIdx++);
    }

    // K dims: ring around each KV anchor (inner)
    for (let i = 0; i < attentionData.kDims.length; i++) {
      const dim = attentionData.kDims[i];
      const layer = dim.layer;
      const kvHead = dim.head ?? 0;
      const dimIdx = dim.dim;

      const [kvX, , kvZ] = getKVPosition(layer, kvHead);
      const y = getLayerY(layer);
      const angle = (dimIdx / headDim) * Math.PI * 2;
      const x = kvX + Math.cos(angle) * KV_DIM_RADIUS;
      const z = kvZ + Math.sin(angle) * KV_DIM_RADIUS;

      positions.push(x, y, z);
      sizes.push(rowL2ToSize(dim.row_l2, maxRowL2) * 0.4);
      const zScore = (dim.row_l2 - attentionStats.mean) / attentionStats.std;
      const [r, g, b] = zScoreToColor(zScore);
      colors.push(r, g, b);
      pointIds.push(globalIdx++);
    }

    // V dims: ring around each KV anchor (outer)
    for (let i = 0; i < attentionData.vDims.length; i++) {
      const dim = attentionData.vDims[i];
      const layer = dim.layer;
      const kvHead = dim.head ?? 0;
      const dimIdx = dim.dim;

      const [kvX, , kvZ] = getKVPosition(layer, kvHead);
      const y = getLayerY(layer);
      const angle = (dimIdx / headDim) * Math.PI * 2 + 0.05; // Slight offset
      const x = kvX + Math.cos(angle) * (KV_DIM_RADIUS + 0.3);
      const z = kvZ + Math.sin(angle) * (KV_DIM_RADIUS + 0.3);

      positions.push(x, y, z);
      sizes.push(rowL2ToSize(dim.row_l2, maxRowL2) * 0.4);
      const zScore = (dim.row_l2 - attentionStats.mean) / attentionStats.std;
      const [r, g, b] = zScoreToColor(zScore);
      colors.push(r, g, b);
      pointIds.push(globalIdx++);
    }

    // O dims: ring near O tile
    for (let i = 0; i < attentionData.oDims.length; i++) {
      const dim = attentionData.oDims[i];
      const layer = dim.layer;
      const head = dim.head ?? 0;
      const dimIdx = dim.dim;

      const oTileX = ATTENTION_OFFSET_X + O_TILE_POS.x;
      const oTileZ = O_TILE_POS.z + 2.5; // Position below O tile
      const y = getLayerY(layer);
      
      // Arrange by head in a larger ring
      const headAngle = (head / numHeads) * Math.PI * 2;
      const dimAngle = (dimIdx / headDim) * Math.PI * 2;
      const headRadius = O_DIM_RADIUS + 0.5;
      const dimRadius = 0.4;
      
      const centerX = oTileX + Math.cos(headAngle) * headRadius;
      const centerZ = oTileZ + Math.sin(headAngle) * headRadius;
      const x = centerX + Math.cos(dimAngle) * dimRadius;
      const z = centerZ + Math.sin(dimAngle) * dimRadius;

      positions.push(x, y, z);
      sizes.push(rowL2ToSize(dim.row_l2, maxRowL2) * 0.4);
      const zScore = (dim.row_l2 - attentionStats.mean) / attentionStats.std;
      const [r, g, b] = zScoreToColor(zScore);
      colors.push(r, g, b);
      pointIds.push(globalIdx++);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute("customColor", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("pointId", new THREE.Float32BufferAttribute(pointIds, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: dimensionPointsVertexShader,
      fragmentShader: dimensionPointsFragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uPointScale: { value: 12.0 },
        uMinSize: { value: 1.0 },
        uMaxSize: { value: 15.0 },
        uOpacity: { value: 0.85 },
        uHighlightColor: { value: new THREE.Vector3(1, 1, 1) },
        uHighlightId: { value: -1 },
        uHighlightRange: { value: 1 },
        uGlowIntensity: { value: 0.15 },
      },
    });

    const points = new THREE.Points(geometry, material);
    attentionPointsRef.current = points;
    scene.add(points);
  }, [attentionData, attentionStats, allAttentionDims, getLayerY, getHeadPosition, getKVPosition, headDim, numHeads, zScoreToColor]);

  // Build MLP dimension point clouds (down, up, gate) with diverging colors
  useEffect(() => {
    if (!sceneRef.current || !mlpData || !mlpStats) return;

    const scene = sceneRef.current;

    // Remove old points
    if (mlpPointsRef.current) {
      scene.remove(mlpPointsRef.current);
      mlpPointsRef.current.geometry.dispose();
      (mlpPointsRef.current.material as THREE.Material).dispose();
    }

    // Compute max using loop (avoid stack overflow with large arrays)
    let maxRowL2 = 0;
    for (let i = 0; i < allMlpDims.length; i++) {
      if (allMlpDims[i].row_l2 > maxRowL2) maxRowL2 = allMlpDims[i].row_l2;
    }
    if (maxRowL2 === 0) maxRowL2 = 1;

    const positions: number[] = [];
    const sizes: number[] = [];
    const colors: number[] = [];
    const pointIds: number[] = [];

    let globalIdx = 0;

    // down_proj dims: grid near down tile (2048 dims - use all)
    const downGridSize = Math.ceil(Math.sqrt(hiddenSize));
    for (let i = 0; i < mlpData.downDims.length; i++) {
      const dim = mlpData.downDims[i];
      const layer = dim.layer;
      const dimIdx = dim.dim;
      const y = getLayerY(layer);

      const row = Math.floor(dimIdx / downGridSize);
      const col = dimIdx % downGridSize;
      const x = MLP_OFFSET_X + DOWN_TILE_POS.x + (col - downGridSize / 2) * 0.06;
      const z = DOWN_TILE_POS.z - 2 + (row - downGridSize / 2) * 0.06;

      positions.push(x, y, z);
      sizes.push(rowL2ToSize(dim.row_l2, maxRowL2) * 0.4);
      const zScore = (dim.row_l2 - mlpStats.mean) / mlpStats.std;
      const [r, g, b] = zScoreToColor(zScore);
      colors.push(r, g, b);
      pointIds.push(globalIdx++);
    }

    // up_proj dims: grid near up tile (11008 dims - sample every 16th for performance)
    const upSampleStep = 16;
    const upGridSize = Math.ceil(Math.sqrt(intermediateSize / upSampleStep));
    for (let i = 0; i < mlpData.upDims.length; i += upSampleStep) {
      const dim = mlpData.upDims[i];
      if (!dim) continue;
      const layer = dim.layer;
      const sampledIdx = Math.floor(dim.dim / upSampleStep);
      const y = getLayerY(layer);

      const row = Math.floor(sampledIdx / upGridSize);
      const col = sampledIdx % upGridSize;
      const x = MLP_OFFSET_X + UP_TILE_POS.x + (col - upGridSize / 2) * 0.06;
      const z = UP_TILE_POS.z + 2 + (row - upGridSize / 2) * 0.06;

      positions.push(x, y, z);
      sizes.push(rowL2ToSize(dim.row_l2, maxRowL2) * 0.4);
      const zScore = (dim.row_l2 - mlpStats.mean) / mlpStats.std;
      const [r, g, b] = zScoreToColor(zScore);
      colors.push(r, g, b);
      pointIds.push(globalIdx++);
    }

    // gate_proj dims: grid near gate tile (11008 dims - sample every 16th for performance)
    const gateSampleStep = 16;
    const gateGridSize = Math.ceil(Math.sqrt(intermediateSize / gateSampleStep));
    for (let i = 0; i < mlpData.gateDims.length; i += gateSampleStep) {
      const dim = mlpData.gateDims[i];
      if (!dim) continue;
      const layer = dim.layer;
      const sampledIdx = Math.floor(dim.dim / gateSampleStep);
      const y = getLayerY(layer);

      const row = Math.floor(sampledIdx / gateGridSize);
      const col = sampledIdx % gateGridSize;
      const x = MLP_OFFSET_X + GATE_TILE_POS.x + (col - gateGridSize / 2) * 0.06;
      const z = GATE_TILE_POS.z + 2 + (row - gateGridSize / 2) * 0.06;

      positions.push(x, y, z);
      sizes.push(rowL2ToSize(dim.row_l2, maxRowL2) * 0.4);
      const zScore = (dim.row_l2 - mlpStats.mean) / mlpStats.std;
      const [r, g, b] = zScoreToColor(zScore);
      colors.push(r, g, b);
      pointIds.push(globalIdx++);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute("customColor", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("pointId", new THREE.Float32BufferAttribute(pointIds, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: dimensionPointsVertexShader,
      fragmentShader: dimensionPointsFragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uPointScale: { value: 10.0 },
        uMinSize: { value: 1.0 },
        uMaxSize: { value: 12.0 },
        uOpacity: { value: 0.8 },
        uHighlightColor: { value: new THREE.Vector3(1, 1, 1) },
        uHighlightId: { value: -1 },
        uHighlightRange: { value: 1 },
        uGlowIntensity: { value: 0.12 },
      },
    });

    const points = new THREE.Points(geometry, material);
    mlpPointsRef.current = points;
    scene.add(points);
  }, [mlpData, mlpStats, allMlpDims, getLayerY, hiddenSize, intermediateSize, zScoreToColor]);

  if (state.status !== "ready") {
    return (
      <Box bg="bg.panel" borderRadius="lg" p={4} h="100%" display="flex" alignItems="center" justifyContent="center">
        <Spinner size="lg" color="blue.400" />
        <Text ml={3} color="fg.muted">
          Loading transformer data...
        </Text>
      </Box>
    );
  }

  return (
    <Box
      bg="bg.panel"
      borderRadius="lg"
      p={2}
      overflow="hidden"
      position="relative"
      h="100%"
      display="flex"
      flexDirection="column"
      border="1px solid"
      borderColor="gray.subtle"
    >
      <Text fontSize="xs" fontWeight="semibold" color="accentSubtle" mb={1}>
        3D Architecture
        <Text as="span" fontWeight="normal" color="fg.muted" ml={1}>
          • Drag to rotate • Scroll to zoom
        </Text>
        {isBuilding && <Spinner size="xs" ml={2} />}
      </Text>

      <Box
        ref={containerRef}
        flex="1"
        h="100%"
        minH="400px"
        position="relative"
        borderRadius="md"
        overflow="hidden"
      />
    </Box>
  );
}
