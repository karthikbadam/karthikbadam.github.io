import { useRef, useEffect, useState, useCallback } from "react";
import { Box, Text, Spinner } from "@chakra-ui/react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { makeClient } from "@uwdata/mosaic-core";
import { column, Query, sql } from "@uwdata/mosaic-sql";
import { useGaia } from "../../../contexts/GaiaContext";
import { useStarHover } from "./useStarHover";
import { StarInfoOverlay } from "./StarInfoOverlay";

/** Star data for 3D rendering */
interface Star3D {
  source_id: string;
  parallax: number;
  phot_g_mean_mag: number;
  bp_rp: number;
  x_pc: number;
  y_pc: number;
  z_pc: number;
}

// SQL column references
const UX = column("ux");
const UY = column("uy");
const UZ = column("uz");
const R = column("r_pc");

/** Map BP-RP color index to RGB */
function bpRpToColor(bpRp: number): THREE.Color {
  const t = Math.max(0, Math.min(1, (bpRp + 0.5) / 3.5));
  if (t < 0.33) {
    const s = t / 0.33;
    return new THREE.Color(0.5 + 0.5 * s, 0.7 + 0.3 * s, 1.0);
  } else if (t < 0.66) {
    const s = (t - 0.33) / 0.33;
    return new THREE.Color(1.0, 1.0 - 0.2 * s, 1.0 - 0.6 * s);
  } else {
    const s = (t - 0.66) / 0.34;
    return new THREE.Color(1.0, 0.8 - 0.5 * s, 0.4 - 0.3 * s);
  }
}

/** Map magnitude to point size (brighter = larger) */
function magToSize(mag: number): number {
  const normalized = Math.max(0, Math.min(1, (15 - mag) / 9));
  return 7 + normalized * 20;
}

/** Create glowing sprite texture */
function createGlowTexture(color: THREE.Color): THREE.Texture {
  const canvas = document.createElement("canvas");
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 1)`);
  gradient.addColorStop(0.5, `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0.5)`);
  gradient.addColorStop(1, `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Fit camera to bounding sphere */
function fitCameraToSphere(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls | null,
  center: THREE.Vector3,
  radius: number
) {
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const dist = radius / Math.tan(fov / 2);

  camera.position.copy(center.clone().add(new THREE.Vector3(0, 0, dist * 1.35)));
  camera.near = Math.max(0.1, dist * 0.01);
  camera.far = dist * 20 + radius * 5;
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
}

/** Build the 3D coordinate query for stars */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStarQuery(predicate: any) {
  return Query.from("gaia_gal")
    .select({
      source_id: "source_id",
      phot_g_mean_mag: "phot_g_mean_mag",
      bp_rp: "bp_rp",
      parallax: "parallax",
      x_pc: sql`
        (avg(${R}) OVER ()) * (
          ${UX} * (CASE WHEN sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) < 1e-12 THEN 1.0 ELSE -(avg(${UY}) OVER ()) / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) END) +
          ${UY} * (CASE WHEN sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) < 1e-12 THEN 0.0 ELSE (avg(${UX}) OVER ()) / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) END)
        )
      `,
      y_pc: sql`
        (avg(${R}) OVER ()) * (
          ${UX} * (-((avg(${UZ}) OVER ()) / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2) + pow(avg(${UZ}) OVER (),2))) * (CASE WHEN sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) < 1e-12 THEN 0.0 ELSE (avg(${UX}) OVER ()) / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) END)) +
          ${UY} * (((avg(${UZ}) OVER ()) / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2) + pow(avg(${UZ}) OVER (),2))) * (CASE WHEN sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) < 1e-12 THEN 1.0 ELSE -(avg(${UY}) OVER ()) / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) END)) +
          ${UZ} * (((avg(${UX}) OVER ()) / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2) + pow(avg(${UZ}) OVER (),2))) * (CASE WHEN sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) < 1e-12 THEN 0.0 ELSE (avg(${UX}) OVER ()) / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) END) - ((avg(${UY}) OVER ()) / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2) + pow(avg(${UZ}) OVER (),2))) * (CASE WHEN sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) < 1e-12 THEN 1.0 ELSE -(avg(${UY}) OVER ()) / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) END))
        )
      `,
      z_pc: sql`(avg(${R}) OVER ()) - ${R}`,
    })
    .where(predicate);
}

export function ThreeDView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const hoverSpriteRef = useRef<THREE.Sprite | null>(null);
  const originalSizesRef = useRef<Float32Array | null>(null);
  const frameRef = useRef<number>(0);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const starsDataRef = useRef<{ stars: Star3D[]; positions: THREE.Vector3[] }>({ stars: [], positions: [] });
  const selectedIndexRef = useRef<number | null>(null);

  const { coordinator, brushSelection } = useGaia();
  const [stars, setStars] = useState<Star3D[]>([]);
  const [isPending, setIsPending] = useState(false);

  // Find star callback for hover hook
  const findStar = useCallback(
    (sourceId: string) => starsDataRef.current.stars.find((s) => s.source_id === sourceId),
    []
  );

  const { selectedStar, onStarHover, onStarLeave } = useStarHover<Star3D>({
    dwellTime: 700,
    findStar,
  });

  // Initialize Three.js scene and handle mouse interactions
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const { clientWidth: width, clientHeight: height } = container;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100000);
    camera.position.set(0, 0, 500);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls - pan only (no rotation)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enableRotate = false;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controlsRef.current = controls;

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

    // Mouse move - hover picking
    const handleMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      raycasterRef.current.params.Points = { threshold: 6 };

      const points = pointsRef.current;
      if (!points) return;

      const intersects = raycasterRef.current.intersectObject(points);
      if (intersects.length > 0) {
        const idx = intersects[0].index;
        if (idx !== undefined && starsDataRef.current.stars[idx]) {
          onStarHover(starsDataRef.current.stars[idx]);
        }
      } else {
        onStarLeave();
      }
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
  }, [onStarHover, onStarLeave]);

  // Mosaic client for brush selection
  useEffect(() => {
    if (!coordinator || !brushSelection) return;

    const client = makeClient({
      coordinator,
      selection: brushSelection,
      query: buildStarQuery,
      queryResult: (data: unknown) => {
        const table = data as Star3D[];
        const newStars: Star3D[] = [];
        for (const row of table) {
          newStars.push({
            source_id: String(row.source_id || ""),
            parallax: row.parallax,
            phot_g_mean_mag: row.phot_g_mean_mag,
            bp_rp: row.bp_rp,
            x_pc: row.x_pc,
            y_pc: row.y_pc,
            z_pc: row.z_pc,
          });
        }
        setStars(newStars);
        setIsPending(false);
      },
      queryPending: () => setIsPending(true),
      queryError: (err) => {
        console.error("[3D] Query error:", err);
        setIsPending(false);
      },
    });

    return () => client.destroy();
  }, [coordinator, brushSelection]);

  // Update Three.js points when stars change (rebuilds geometry, fits camera)
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera) return;

    // Cleanup old objects
    if (pointsRef.current) {
      scene.remove(pointsRef.current);
      pointsRef.current.geometry.dispose();
      (pointsRef.current.material as THREE.Material).dispose();
      pointsRef.current = null;
    }
    if (hoverSpriteRef.current) {
      scene.remove(hoverSpriteRef.current);
      hoverSpriteRef.current.material.dispose();
      hoverSpriteRef.current = null;
    }
    originalSizesRef.current = null;
    selectedIndexRef.current = null;
    starsDataRef.current = { stars: [], positions: [] };

    if (stars.length === 0) return;

    // Build geometry data
    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];
    const positions3D: THREE.Vector3[] = [];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const star of stars) {
      const { x_pc: x, y_pc: y, z_pc: z } = star;
      minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);

      positions3D.push(new THREE.Vector3(x, y, z));
      positions.push(x, y, z);
      const c = bpRpToColor(star.bp_rp);
      colors.push(c.r, c.g, c.b);
      sizes.push(magToSize(star.phot_g_mean_mag));
    }

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    originalSizesRef.current = new Float32Array(sizes);

    // Shader material for soft star rendering
    const material = new THREE.ShaderMaterial({
      uniforms: {
        pixelRatio: { value: window.devicePixelRatio },
        globalAlpha: { value: 0.7 },
      },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float pixelRatio;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float distScale = clamp(400.0 / -mv.z, 0.4, 6.0);
          gl_PointSize = size * pixelRatio * distScale;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        uniform float globalAlpha;
        void main() {
          vec2 p = gl_PointCoord - vec2(0.5);
          float r2 = dot(p, p);
          float core = exp(-r2 * 80.0);
          float halo = exp(-r2 * 18.0);
          float a = (0.85 * core + 0.25 * halo) * globalAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * (1.2 * core + 0.6 * halo), a);
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);
    pointsRef.current = points;
    starsDataRef.current = { stars, positions: positions3D };

    // Fit camera only when stars change
    const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    const radius = center.distanceTo(new THREE.Vector3(maxX, maxY, maxZ));
    fitCameraToSphere(camera, controls, center, Math.max(radius, 1) / 2);
  }, [stars]);

  // Update highlight when selectedStar changes (no camera reset)
  useEffect(() => {
    const scene = sceneRef.current;
    const points = pointsRef.current;
    if (!scene || !points || !originalSizesRef.current) return;

    const geometry = points.geometry;
    const sizeAttr = geometry.getAttribute("size") as THREE.BufferAttribute;

    // Reset previous highlight
    if (selectedIndexRef.current !== null) {
      sizeAttr.array[selectedIndexRef.current] = originalSizesRef.current[selectedIndexRef.current];
      selectedIndexRef.current = null;
    }
    if (hoverSpriteRef.current) {
      scene.remove(hoverSpriteRef.current);
      hoverSpriteRef.current.material.dispose();
      hoverSpriteRef.current = null;
    }

    if (!selectedStar) {
      sizeAttr.needsUpdate = true;
      return;
    }

    // Apply new highlight
    const starIndex = starsDataRef.current.stars.findIndex((s) => s.source_id === selectedStar.source_id);
    if (starIndex !== -1) {
      sizeAttr.array[starIndex] = originalSizesRef.current[starIndex] * 2.5;
      sizeAttr.needsUpdate = true;
      selectedIndexRef.current = starIndex;

      // Create glow sprite
      const pos = starsDataRef.current.positions[starIndex];
      const glowTexture = createGlowTexture(new THREE.Color(1, 0.8, 0));
      const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(glowMaterial);
      sprite.scale.set(30, 30, 1);
      sprite.position.copy(pos);
      scene.add(sprite);
      hoverSpriteRef.current = sprite;
    }
  }, [selectedStar]);

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
        3D View
        <Text as="span" fontWeight="normal" color="fg.muted" ml={1}>
          • Drag to pan • Scroll to zoom
        </Text>
      </Text>

      <Box
        ref={containerRef}
        flex="1"
        h="100%"
        minH="100px"
        position="relative"
        bg="#0a0a14"
        borderRadius="md"
        overflow="hidden"
      >
        {isPending && (
          <Box position="absolute" top="50%" left="50%" transform="translate(-50%, -50%)" zIndex={10}>
            <Spinner size="lg" color="blue.400" />
          </Box>
        )}
        {selectedStar && <StarInfoOverlay sourceId={selectedStar.source_id} />}
      </Box>
    </Box>
  );
}
