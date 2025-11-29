import { Box, Text, Spinner } from "@chakra-ui/react";
import { useEffect, useRef, useState, useCallback, ReactNode } from "react";

export interface ChartDimensions {
  width: number;
  height: number;
}

type ChartBuilder<T = void> = (
  setupResult: T,
  dimensions: ChartDimensions
) => HTMLElement | null;

interface MosaicChartProps<T = void> {
  /** Title displayed above the chart */
  title: string;
  /** Optional subtitle/status text or element */
  subtitle?: ReactNode;
  /**
   * Optional async setup function that runs queries/creates views.
   * Returns data needed by build().
   */
  setup?: () => Promise<T>;
  /**
   * Builds the chart element.
   * Receives result from setup() if provided, plus container dimensions.
   */
  build: ChartBuilder<T>;
  /** Dependencies that trigger chart rebuild */
  dependencies?: unknown[];
  /** Whether the context is ready */
  isReady: boolean;
  /** Optional loading text */
  loadingText?: string;
  /** Grid area name for CSS Grid layout */
  gridArea?: string;
}

export function MosaicChart<T = void>({
  title,
  subtitle,
  setup,
  build,
  dependencies = [],
  isReady,
  loadingText = "Loading...",
  gridArea,
}: MosaicChartProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [dimensions, setDimensions] = useState<ChartDimensions>({
    width: 0,
    height: 0,
  });

  // Track container dimensions with ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setDimensions((prev) => {
          // Only update if changed to avoid unnecessary re-renders
          if (prev.width !== width || prev.height !== height) {
            return { width: 1.5 * width, height: 1.5 * height };
          }
          return prev;
        });
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const renderChart = useCallback(async () => {
    if (!isReady || !containerRef.current) return;
    // Wait for valid dimensions
    if (dimensions.width === 0 || dimensions.height === 0) return;

    setIsBuilding(true);
    try {
      // Run setup queries if provided
      const setupResult = setup ? await setup() : (undefined as T);

      // Build chart with setup results and dimensions
      const chart = build(setupResult, dimensions);

      if (chart && containerRef.current) {
        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(chart);
      }
    } catch (error) {
      console.error(`Failed to render chart "${title}":`, error);
    } finally {
      setIsBuilding(false);
    }
  }, [isReady, setup, build, title, dimensions]);

  useEffect(() => {
    renderChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderChart, ...dependencies]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (containerRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        containerRef.current.innerHTML = "";
      }
    };
  }, []);

  if (!isReady) {
    return (
      <Box gridArea={gridArea} bg="bg.subtle" borderRadius="lg" p={3}>
        <Text fontSize="sm" color="fg.muted">
          {loadingText}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      gridArea={gridArea}
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
        {title}
        {subtitle && (
          <Text as="span" fontWeight="normal" color="fg.muted" ml={1}>
            {subtitle}
          </Text>
        )}
        {isBuilding && <Spinner size="xs" ml={2} />}
      </Text>
      <Box ref={containerRef} flex="1" h="100%" minH={{ base: "350px", md: "100px" }} overflow="auto" />
    </Box>
  );
}
