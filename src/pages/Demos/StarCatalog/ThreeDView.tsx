import { useRef, useEffect, useState } from "react";
import { Box, Text, Spinner, Link, Icon, HStack } from "@chakra-ui/react";
import { LuExternalLink } from "react-icons/lu";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { makeClient } from "@uwdata/mosaic-core";
import { column, Query, sql, isNotDistinct, literal } from "@uwdata/mosaic-sql";
import { useGaia } from "../../../contexts/GaiaContext";

/** Star data for 3D rendering (Option A slab coords from SQL) */
interface Star3D {
  source_id: string;
  parallax: number;
  phot_g_mean_mag: number;
  bp_rp: number;
  x_pc: number;
  y_pc: number;
  z_pc: number;
}

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
  return 5 + normalized * 20;
}

/** Create glowing sprite texture (radial gradient) */
function createGlowTexture(color: THREE.Color): THREE.Texture {
  const canvas = document.createElement("canvas");
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(
    0,
    `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 1)`
  );
  gradient.addColorStop(
    0.5,
    `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0.5)`
  );
  gradient.addColorStop(
    1,
    `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0)`
  );

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Fit camera to bounding sphere (in view direction) */
function fitCameraToSphere(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls | null,
  center: THREE.Vector3,
  radius: number,
  viewDir: THREE.Vector3
) {
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const dist = radius / Math.tan(fov / 2);

  // move camera back along viewDir
  const pos = center.clone().add(
    viewDir
      .clone()
      .normalize()
      .multiplyScalar(dist * 1.35)
  );
  camera.position.copy(pos);

  camera.near = Math.max(0.1, dist * 0.01);
  camera.far = dist * 20 + radius * 5;
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
}

export function ThreeDView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const hoverSpriteRef = useRef<THREE.Sprite | null>(null);
  const originalSizesRef = useRef<Float32Array | null>(null);
  const frameRef = useRef<number>(0);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const starsDataRef = useRef<{ stars: Star3D[]; positions: THREE.Vector3[] }>({
    stars: [],
    positions: [],
  });

  const { coordinator, brushSelection, hoverSelection } = useGaia();

  const [stars, setStars] = useState<Star3D[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [selectedStar, setSelectedStar] = useState<Star3D | null>(null);

  // Keep one renderer around (dispose on unmount)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Timer ref for hover delay before updating hoverSelection
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredSourceIdRef = useRef<string | null>(null);

  // Track which star index is selected (for persistent highlight)
  const selectedIndexRef = useRef<number | null>(null);

  // Source identifier for hover selection updates (must be an object for Mosaic)
  const hoverSourceRef = useRef({ name: "3d-view-hover" });

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    // scene.background = new THREE.Color(0x0a0a14);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100000);
    camera.position.set(0, 0, 500);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enableRotate = false; // Disable rotation
    controls.enablePan = true; // Keep panning
    controls.enableZoom = true; // Keep zooming
    // Remap left-click to pan (since rotation is disabled)
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controlsRef.current = controls;

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Hover picking - only starts timer for hoverSelection, visual highlight via separate effect
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
          const s = starsDataRef.current.stars[idx];

          // Start timer for hover selection update (only if star changed)
          // Visual highlight only happens when hoverSelection is set (via separate effect)
          if (s.source_id !== lastHoveredSourceIdRef.current) {
            // Clear any existing timer
            if (hoverTimerRef.current) {
              clearTimeout(hoverTimerRef.current);
            }
            lastHoveredSourceIdRef.current = s.source_id;

            // Start new timer to update hoverSelection after 700ms dwell
            hoverTimerRef.current = setTimeout(() => {
              if (hoverSelection) {
                const clause = {
                  source: hoverSourceRef.current,
                  clients: new Set([]),
                  value: s.source_id,
                  predicate: isNotDistinct(
                    "source_id",
                    literal(s.source_id)
                  ),
                };
                hoverSelection.update(clause);
              }
            }, 700);
          }
        }
      } else {
        // Clear hover timer when not hovering (but keep selection for table interaction)
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
        lastHoveredSourceIdRef.current = null;
        // Note: Don't clear hoverSelection here - keep it so user can interact with the links
      }
    };
    container.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(frameRef.current);
      renderer.dispose();
      if (container.contains(renderer.domElement))
        container.removeChild(renderer.domElement);
      // Clear hover timer on unmount
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, [hoverSelection]);

  // Create Mosaic client for brush selection coordination
  useEffect(() => {
    if (!coordinator || !brushSelection) return;

    const client = makeClient({
      coordinator,
      selection: brushSelection,

      query: (predicate) => {
        const q = Query.from("gaia_gal")
          .select({
            source_id: "source_id",
            phot_g_mean_mag: "phot_g_mean_mag",
            bp_rp: "bp_rp",
            parallax: "parallax",

            x_pc: sql`
              (avg(${R}) OVER ()) * (
                ${UX} * (
                  CASE
                    WHEN sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) < 1e-12
                    THEN 1.0
                    ELSE -(avg(${UY}) OVER ())
                        / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2))
                  END
                )
                +
                ${UY} * (
                  CASE
                    WHEN sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) < 1e-12
                    THEN 0.0
                    ELSE (avg(${UX}) OVER ())
                        / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2))
                  END
                )
              )
            `,
            y_pc: sql`
              (avg(${R}) OVER ()) * (
                ${UX} * (
                  -(
                    (avg(${UZ}) OVER ()) / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2) + pow(avg(${UZ}) OVER (),2))
                  ) * (
                    CASE
                      WHEN sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) < 1e-12
                      THEN 0.0
                      ELSE (avg(${UX}) OVER ())
                          / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2))
                    END
                  )
                )
                +
                ${UY} * (
                  (
                    (avg(${UZ}) OVER ()) / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2) + pow(avg(${UZ}) OVER (),2))
                  ) * (
                    CASE
                      WHEN sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) < 1e-12
                      THEN 1.0
                      ELSE -(avg(${UY}) OVER ())
                          / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2))
                    END
                  )
                )
                +
                ${UZ} * (
                  (
                    (avg(${UX}) OVER ()) / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2) + pow(avg(${UZ}) OVER (),2))
                  ) * (
                    CASE
                      WHEN sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) < 1e-12
                      THEN 0.0
                      ELSE (avg(${UX}) OVER ())
                          / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2))
                    END
                  )
                  -
                  (
                    (avg(${UY}) OVER ()) / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2) + pow(avg(${UZ}) OVER (),2))
                  ) * (
                    CASE
                      WHEN sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2)) < 1e-12
                      THEN 1.0
                      ELSE -(avg(${UY}) OVER ())
                          / sqrt(pow(avg(${UX}) OVER (),2) + pow(avg(${UY}) OVER (),2))
                    END
                  )
                )
              )
            `,
            // z: near in front, far in back -> invert sign so smaller r comes toward camera
            z_pc: sql`(avg(${R}) OVER ()) - ${R}`,
          })
          .where(predicate);

        return q;
      },

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

  // Listen to hoverSelection changes and persistently highlight the selected star
  useEffect(() => {
    if (!hoverSelection) return;

    const handleSelectionChange = () => {
      const clauses = hoverSelection.clauses ?? [];
      if (clauses.length > 0 && clauses[0]?.value) {
        const sourceId = String(clauses[0].value);
        // Find the star by source_id
        const star = starsDataRef.current.stars.find(
          (s) => s.source_id === sourceId
        );
        setSelectedStar(star || null);
      } else {
        setSelectedStar(null);
      }
    };

    handleSelectionChange();
    hoverSelection.addEventListener("value", handleSelectionChange);

    return () => {
      hoverSelection.removeEventListener("value", handleSelectionChange);
    };
  }, [hoverSelection]);

  // Update highlight when selectedStar changes
  // Use a slight delay to ensure starsDataRef is populated after stars effect runs
  useEffect(() => {
    // Small timeout to ensure the stars effect has run and populated starsDataRef
    const timeoutId = setTimeout(() => {
      const points = pointsRef.current;
      const scene = sceneRef.current;
      if (!points || !originalSizesRef.current) return;

      const geometry = points.geometry;
      const sizeAttr = geometry.getAttribute("size") as THREE.BufferAttribute;
      if (!sizeAttr) return;

      // Reset previous selected star size
      if (selectedIndexRef.current !== null && originalSizesRef.current) {
        sizeAttr.array[selectedIndexRef.current] =
          originalSizesRef.current[selectedIndexRef.current];
        selectedIndexRef.current = null;
      }

      // Hide glow sprite if no selection
      if (!selectedStar) {
        if (hoverSpriteRef.current) hoverSpriteRef.current.visible = false;
        sizeAttr.needsUpdate = true;
        return;
      }

      // Find the star by source_id and highlight it
      const starIndex = starsDataRef.current.stars.findIndex(
        (s) => s.source_id === selectedStar.source_id
      );

      if (starIndex !== -1) {
        const originalSize = originalSizesRef.current[starIndex];
        sizeAttr.array[starIndex] = originalSize * 2.5;
        selectedIndexRef.current = starIndex;
        sizeAttr.needsUpdate = true;

        // Show glow sprite at selected star position
        const pos = starsDataRef.current.positions[starIndex];
        if (pos) {
          if (!hoverSpriteRef.current && scene) {
            const glowColor = new THREE.Color(1, 0.8, 0);
            const glowTexture = createGlowTexture(glowColor);
            const glowMaterial = new THREE.SpriteMaterial({
              map: glowTexture,
              transparent: true,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            });
            const sprite = new THREE.Sprite(glowMaterial);
            sprite.scale.set(30, 30, 1);
            scene.add(sprite);
            hoverSpriteRef.current = sprite;
          }

          if (hoverSpriteRef.current) {
            hoverSpriteRef.current.visible = true;
            hoverSpriteRef.current.position.set(pos.x, pos.y, pos.z);
          }
        }
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [selectedStar, stars]);

  // Update Three.js points when stars change
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera) return;

    // Remove old points
    if (pointsRef.current) {
      scene.remove(pointsRef.current);
      pointsRef.current.geometry.dispose();
      (pointsRef.current.material as THREE.Material).dispose();
      pointsRef.current = null;
    }

    // Remove old hover sprite
    if (hoverSpriteRef.current) {
      scene.remove(hoverSpriteRef.current);
      hoverSpriteRef.current.material.dispose();
      hoverSpriteRef.current = null;
    }

    // Reset original sizes state
    originalSizesRef.current = null;

    starsDataRef.current = { stars: [], positions: [] };
    if (stars.length === 0) return;

    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];
    const positions3D: THREE.Vector3[] = [];

    // Compute bounds (for fit + for stable scaling)
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    for (const star of stars) {
      const x = star.x_pc;
      const y = star.y_pc;
      const z = star.z_pc;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);

      const pos = new THREE.Vector3(x, y, z);
      positions3D.push(pos);
      positions.push(x, y, z);

      const c = bpRpToColor(star.bp_rp);
      colors.push(c.r, c.g, c.b);

      sizes.push(magToSize(star.phot_g_mean_mag));
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const sizeAttribute = new THREE.Float32BufferAttribute(sizes, 1);
    geometry.setAttribute("size", sizeAttribute);

    // Store original sizes for hover effect
    originalSizesRef.current = new Float32Array(sizes);

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
          // Keep points from shrinking too aggressively
          float distScale = clamp(400.0 / -mv.z, 0.4, 6.0);
          gl_PointSize = size * pixelRatio * distScale;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        uniform float globalAlpha;

        void main() {
          // Soft sprite: radial gaussian-ish + bright core
          vec2 p = gl_PointCoord - vec2(0.5);
          float r2 = dot(p, p); // 0..0.5^2

          // Core + halo (tunable)
          float core = exp(-r2 * 80.0);
          float halo = exp(-r2 * 18.0);

          float a = (0.85 * core + 0.25 * halo) * globalAlpha;

          // Discard only very far out
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

    // Fit camera to selected region bounds
    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2
    );
    const radius = center.distanceTo(new THREE.Vector3(maxX, maxY, maxZ));

    // View direction: look along +Z so "near" (higher z due to inversion) is in front
    // Our z_pc is (r0 - r). Smaller r => larger z => toward camera if camera is on +Z looking toward center.
    const viewDir = new THREE.Vector3(0, 0, 1);

    fitCameraToSphere(
      camera,
      controls,
      center,
      Math.max(radius, 1) / 2,
      viewDir
    );
  }, [stars]);

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
          <Box
            position="absolute"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
            zIndex={10}
          >
            <Spinner size="lg" color="blue.400" />
          </Box>
        )}

        {/* Selected star info overlay */}
        {selectedStar && (
          <Box
            position="absolute"
            bottom={2}
            left={2}
            zIndex={10}
            bg="blackAlpha.700"
            backdropFilter="blur(4px)"
            px={3}
            py={2}
            borderRadius="md"
          >
            <HStack gap={3} fontSize="xs">
              <Text fontWeight="semibold" color="accentSubtle">
                Gaia DR3 {selectedStar.source_id}
              </Text>
              <Link
                href={`https://simbad.cds.unistra.fr/simbad/sim-basic?Ident=${encodeURIComponent(
                  `Gaia DR3 ${selectedStar.source_id}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                color="blue.300"
                display="flex"
                alignItems="center"
                gap={1}
                _hover={{ textDecoration: "underline", color: "blue.200" }}
              >
                Simbad
                <Icon as={LuExternalLink} boxSize={3} />
              </Link>
              <Link
                href={`https://gaia.aip.de/gaia/viewer/${selectedStar.source_id}/`}
                target="_blank"
                rel="noopener noreferrer"
                color="orange.300"
                display="flex"
                alignItems="center"
                gap={1}
                _hover={{ textDecoration: "underline", color: "orange.200" }}
              >
                Gaia@AIP
                <Icon as={LuExternalLink} boxSize={3} />
              </Link>
            </HStack>
          </Box>
        )}
      </Box>
    </Box>
  );
}
