import { useEffect, useState } from "react";
import { Box, Text, VStack, HStack, Badge, Separator, Spinner } from "@chakra-ui/react";
import { useTransformer } from "../../../contexts/TransformerContext";
import type {
  TensorStats,
  TensorDim,
  HeadAggregate,
  HeadBlockProfile,
} from "../../../types/transformer";
import type { HoverInfo } from "./ThreeJSTower";

interface HoverTooltipProps {
  info: HoverInfo | null;
  position?: { x: number; y: number };
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + "K";
  if (Math.abs(n) >= 1) return n.toFixed(2);
  if (Math.abs(n) >= 0.001) return n.toFixed(4);
  return n.toExponential(2);
}

function formatZScore(z: number): string {
  const sign = z >= 0 ? "+" : "";
  return `${sign}${z.toFixed(2)}σ`;
}

function getZScoreColor(z: number): string {
  if (z < -1.5) return "blue.400";
  if (z < -0.5) return "blue.200";
  if (z > 1.5) return "red.400";
  if (z > 0.5) return "red.200";
  return "gray.300";
}

function getZScoreLabel(z: number): string {
  if (z < -2) return "Strongly suppressed";
  if (z < -1) return "Below average";
  if (z > 2) return "Strongly amplified";
  if (z > 1) return "Above average";
  return "Typical";
}

export function HoverTooltip({ info, position }: HoverTooltipProps) {
  const {
    queryTensorStats,
    queryDimStats,
    queryHeadAggregate,
    queryHeadBlockProfile,
    numHeads,
    numKVHeads,
  } = useTransformer();

  const [tensorStatsData, setTensorStatsData] = useState<TensorStats | null>(null);
  const [dimStatsData, setDimStatsData] = useState<TensorDim | null>(null);
  const [headAggData, setHeadAggData] = useState<HeadAggregate | null>(null);
  const [blockProfile, setBlockProfile] = useState<HeadBlockProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch data when hover info changes
  useEffect(() => {
    if (!info) {
      setTensorStatsData(null);
      setDimStatsData(null);
      setHeadAggData(null);
      setBlockProfile(null);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);

      try {
        if (info.type === "tensor" && info.tensorId) {
          const stats = await queryTensorStats(info.tensorId);
          setTensorStatsData(stats);
        } else if (info.type === "dim" && info.tensorId) {
          const stats = await queryDimStats(info.tensorId, info.head ?? null, info.dim ?? 0);
          setDimStatsData(stats);
        } else if (info.type === "head" && info.layer !== undefined && info.head !== undefined) {
          const [agg, profile] = await Promise.all([
            queryHeadAggregate(info.layer, info.head),
            queryHeadBlockProfile(info.layer, info.head),
          ]);
          setHeadAggData(agg);
          setBlockProfile(profile);
        }
      } catch (err) {
        console.error("HoverTooltip fetch error:", err);
      }

      setIsLoading(false);
    };

    fetchData();
  }, [info, queryTensorStats, queryDimStats, queryHeadAggregate, queryHeadBlockProfile]);

  if (!info) return null;

  const headsPerKV = numHeads / numKVHeads;

  return (
    <Box
      position="absolute"
      top={position?.y ?? 10}
      left={position?.x ?? 10}
      bg="gray.900"
      color="white"
      px={4}
      py={3}
      borderRadius="lg"
      boxShadow="xl"
      minW="240px"
      maxW="320px"
      border="1px solid"
      borderColor="gray.700"
      zIndex={100}
    >
      {isLoading && (
        <HStack mb={2}>
          <Spinner size="xs" />
          <Text fontSize="xs" color="gray.400">Loading...</Text>
        </HStack>
      )}

      {/* Dimension hover */}
      {info.type === "dim" && (
        <VStack align="start" gap={2}>
          <HStack justify="space-between" w="100%">
            <Badge colorPalette={info.role === "down" ? "orange" : "blue"} size="sm">
              {info.role?.toUpperCase()} Dim
            </Badge>
            {info.zScore !== undefined && (
              <Badge 
                colorPalette={info.zScore > 0 ? "red" : "blue"} 
                variant="subtle"
                size="sm"
              >
                {formatZScore(info.zScore)}
              </Badge>
            )}
          </HStack>

          {/* Z-score interpretation */}
          {info.zScore !== undefined && (
            <Text fontSize="xs" color={getZScoreColor(info.zScore)} fontStyle="italic">
              {getZScoreLabel(info.zScore)}
            </Text>
          )}

          <HStack justify="space-between" w="100%">
            <Text fontSize="xs" color="gray.400">Layer</Text>
            <Text fontSize="sm">{info.layer}</Text>
          </HStack>
          {info.head !== undefined && (
            <HStack justify="space-between" w="100%">
              <Text fontSize="xs" color="gray.400">Head</Text>
              <Text fontSize="sm">{info.head}</Text>
            </HStack>
          )}
          <HStack justify="space-between" w="100%">
            <Text fontSize="xs" color="gray.400">Dimension</Text>
            <Text fontSize="sm">{info.dim}</Text>
          </HStack>
          
          <Separator />
          
          <HStack justify="space-between" w="100%">
            <Text fontSize="xs" color="gray.400">Row L2</Text>
            <Text fontSize="sm" fontFamily="mono">{formatNumber(info.value ?? 0)}</Text>
          </HStack>

          {dimStatsData && (
            <>
              <HStack justify="space-between" w="100%">
                <Text fontSize="xs" color="gray.400">Mean Abs</Text>
                <Text fontSize="sm" fontFamily="mono">{formatNumber(dimStatsData.row_mean_abs)}</Text>
              </HStack>
              <HStack justify="space-between" w="100%">
                <Text fontSize="xs" color="gray.400">P95 Abs</Text>
                <Text fontSize="sm" fontFamily="mono">{formatNumber(dimStatsData.row_p95_abs)}</Text>
              </HStack>
              <HStack justify="space-between" w="100%">
                <Text fontSize="xs" color="gray.400">Zero Frac</Text>
                <Text fontSize="sm" fontFamily="mono">{(dimStatsData.row_zero_frac * 100).toFixed(1)}%</Text>
              </HStack>
            </>
          )}

          {/* Color legend */}
          <Separator />
          <HStack gap={2} fontSize="2xs" color="gray.500">
            <Box display="flex" alignItems="center" gap={1}>
              <Box w="8px" h="8px" borderRadius="full" bg="blue.400" />
              <Text>Suppressed</Text>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Box w="8px" h="8px" borderRadius="full" bg="gray.300" />
              <Text>Typical</Text>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Box w="8px" h="8px" borderRadius="full" bg="red.400" />
              <Text>Amplified</Text>
            </Box>
          </HStack>
        </VStack>
      )}

      {/* Head hover */}
      {info.type === "head" && (
        <VStack align="start" gap={2}>
          <HStack>
            <Badge colorPalette="blue" size="sm">Q Head</Badge>
            <Text fontWeight="bold">{info.head}</Text>
          </HStack>
          <HStack justify="space-between" w="100%">
            <Text fontSize="xs" color="gray.400">Layer</Text>
            <Text fontSize="sm">{info.layer}</Text>
          </HStack>
          <HStack justify="space-between" w="100%">
            <Text fontSize="xs" color="gray.400">KV Group</Text>
            <Text fontSize="sm">{info.head !== undefined ? Math.floor(info.head / headsPerKV) : "?"}</Text>
          </HStack>
          
          {headAggData && (
            <>
              <Separator />
              <HStack justify="space-between" w="100%">
                <Text fontSize="xs" color="gray.400">Total L2</Text>
                <Text fontSize="sm" fontFamily="mono">{formatNumber(headAggData.total_l2)}</Text>
              </HStack>
              <HStack justify="space-between" w="100%">
                <Text fontSize="xs" color="gray.400">Avg Mean Abs</Text>
                <Text fontSize="sm" fontFamily="mono">{formatNumber(headAggData.avg_mean_abs)}</Text>
              </HStack>
              <HStack justify="space-between" w="100%">
                <Text fontSize="xs" color="gray.400">Max P95</Text>
                <Text fontSize="sm" fontFamily="mono">{formatNumber(headAggData.max_p95_abs)}</Text>
              </HStack>
            </>
          )}

          {blockProfile && (
            <>
              <Separator />
              <Text fontSize="xs" color="gray.400">In-Block Profile</Text>
              <Box w="100%" h="30px" display="flex" gap="1px">
                {blockProfile.in_block_norms.map((norm, idx) => {
                  const maxNorm = Math.max(...blockProfile.in_block_norms);
                  const height = (norm / maxNorm) * 100;
                  return (
                    <Box
                      key={idx}
                      flex={1}
                      bg="blue.500"
                      opacity={0.3 + (norm / maxNorm) * 0.7}
                      h={`${height}%`}
                      alignSelf="flex-end"
                      borderRadius="sm"
                    />
                  );
                })}
              </Box>
            </>
          )}
        </VStack>
      )}

      {/* KV hover */}
      {info.type === "kv" && (
        <VStack align="start" gap={2}>
          <HStack>
            <Badge colorPalette="purple" size="sm">KV Group</Badge>
            <Text fontWeight="bold">{info.kvGroup}</Text>
          </HStack>
          <HStack justify="space-between" w="100%">
            <Text fontSize="xs" color="gray.400">Layer</Text>
            <Text fontSize="sm">{info.layer}</Text>
          </HStack>
          <HStack justify="space-between" w="100%">
            <Text fontSize="xs" color="gray.400">Serving Heads</Text>
            <Text fontSize="sm">
              {info.kvGroup !== undefined
                ? Array.from({ length: headsPerKV }, (_, i) => info.kvGroup! * headsPerKV + i).join(", ")
                : "?"}
            </Text>
          </HStack>
        </VStack>
      )}

      {/* Tensor hover */}
      {info.type === "tensor" && (
        <VStack align="start" gap={2}>
          <HStack>
            <Badge colorPalette="gray" size="sm">Tensor</Badge>
            <Text fontWeight="bold" fontSize="sm">{info.tensorId}</Text>
          </HStack>
          
          {tensorStatsData && (
            <>
              <Separator />
              <HStack justify="space-between" w="100%">
                <Text fontSize="xs" color="gray.400">Fro Norm</Text>
                <Text fontSize="sm" fontFamily="mono">{formatNumber(tensorStatsData.fro_norm)}</Text>
              </HStack>
              <HStack justify="space-between" w="100%">
                <Text fontSize="xs" color="gray.400">Mean Abs</Text>
                <Text fontSize="sm" fontFamily="mono">{formatNumber(tensorStatsData.mean_abs)}</Text>
              </HStack>
              <HStack justify="space-between" w="100%">
                <Text fontSize="xs" color="gray.400">P95 Abs</Text>
                <Text fontSize="sm" fontFamily="mono">{formatNumber(tensorStatsData.p95_abs)}</Text>
              </HStack>
              <HStack justify="space-between" w="100%">
                <Text fontSize="xs" color="gray.400">Zero Frac</Text>
                <Text fontSize="sm" fontFamily="mono">{(tensorStatsData.zero_frac * 100).toFixed(1)}%</Text>
              </HStack>
            </>
          )}
        </VStack>
      )}

      {/* Layer hover */}
      {info.type === "layer" && (
        <VStack align="start" gap={2}>
          <HStack>
            <Badge colorPalette="gray" size="sm">Layer</Badge>
            <Text fontWeight="bold">{info.layer}</Text>
          </HStack>
          <Text fontSize="xs" color="gray.500">Click to spotlight this layer</Text>
        </VStack>
      )}
    </Box>
  );
}
