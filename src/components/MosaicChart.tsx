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
  title: string;
  subtitle?: ReactNode;
  setup?: () => Promise<T>;
  build: ChartBuilder<T>;
  dependencies?: unknown[];
  isReady: boolean;
  loadingText?: string;
  gridArea?: string;
  /** Optional element to render on the right side of the header */
  rightElement?: ReactNode;
  /** Optional CSS styles to apply to the chart container */
  containerCss?: Record<string, unknown>;
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
  rightElement,
  containerCss,
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
    if (dimensions.width === 0 || dimensions.height === 0) return;

    setIsBuilding(true);
    try {
      const setupResult = setup ? await setup() : (undefined as T);
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
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Text fontSize="xs" fontWeight="semibold" color="accentSubtle">
          {title}
          {subtitle && (
            <Text as="span" fontWeight="normal" color="fg.muted" ml={1}>
              {"• "}
              {subtitle}
            </Text>
          )}
          {isBuilding && <Spinner size="xs" ml={2} />}
        </Text>
        {rightElement}
      </Box>
      <Box
        ref={containerRef}
        flex="1"
        h="100%"
        borderRadius="md"
        minH={{ base: "350px", md: "100px" }}
        overflow="auto"
        css={containerCss}
      />
    </Box>
  );
}
