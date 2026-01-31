import { Box, VStack, Text, HStack, Code, Button } from "@chakra-ui/react";
import { useTransformer } from "../../../../contexts/TransformerContext";
import { useState, useCallback, useEffect } from "react";

interface ActivationInspectorProps {
  layer: number;
  position: number;
  type: "hidden" | "mlp";
  onClose: () => void;
}

export function ActivationInspector({
  layer,
  position,
  type,
  onClose,
}: ActivationInspectorProps) {
  const { coordinator, selectedPromptId, queryHiddenState, queryMLPActivation } =
    useTransformer();
  const [data, setData] = useState<{
    norm: number;
    top_dims: number[];
    top_vals: number[];
    mean?: number;
    std?: number;
    sparsity?: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!coordinator || selectedPromptId === null) {
      return;
    }

    setIsLoading(true);
    try {
      if (type === "hidden") {
        const result = await queryHiddenState(layer, position);
        if (result) {
          setData({
            norm: result.norm,
            mean: result.mean,
            std: result.std,
            top_dims: result.top_dims,
            top_vals: result.top_vals,
          });
        }
      } else {
        // MLP - show gate, up, down
        const gate = await queryMLPActivation(layer, position, "gate");

        if (gate) {
          setData({
            norm: gate.norm,
            top_dims: gate.top_dims,
            top_vals: gate.top_vals,
            sparsity: gate.sparsity,
          });
        }
      }
    } catch (err) {
      console.error("Failed to load activation data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [coordinator, selectedPromptId, layer, position, type, queryHiddenState, queryMLPActivation]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <Box p={3} bg="bg.surface" borderRadius="md" border="1px solid" borderColor="border">
        <Text fontSize="xs">Loading activation data...</Text>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box p={3} bg="bg.surface" borderRadius="md" border="1px solid" borderColor="border">
        <Text fontSize="xs" color="gray.500">
          No activation data available
        </Text>
      </Box>
    );
  }

  return (
    <Box p={3} bg="bg.surface" borderRadius="md" border="1px solid" borderColor="border">
      <VStack gap={2} align="stretch">
        <HStack justify="space-between">
          <Text fontSize="sm" fontWeight="bold">
            {type === "hidden" ? "Hidden State" : "MLP Activations"}
          </Text>
          <Button size="xs" onClick={onClose}>
            Close
          </Button>
        </HStack>
        <Text fontSize="xs" color="gray.fg">
          Layer {layer}, Position {position}
        </Text>

        <VStack gap={1} align="stretch">
          <HStack>
            <Text fontSize="xs" fontWeight="medium">
              Norm:
            </Text>
            <Code fontSize="xs">{data.norm.toFixed(4)}</Code>
          </HStack>
          {data.mean !== undefined && (
            <HStack>
              <Text fontSize="xs" fontWeight="medium">
                Mean:
              </Text>
              <Code fontSize="xs">{data.mean.toFixed(4)}</Code>
            </HStack>
          )}
          {data.std !== undefined && (
            <HStack>
              <Text fontSize="xs" fontWeight="medium">
                Std:
              </Text>
              <Code fontSize="xs">{data.std.toFixed(4)}</Code>
            </HStack>
          )}
          {data.sparsity !== undefined && (
            <HStack>
              <Text fontSize="xs" fontWeight="medium">
                Sparsity:
              </Text>
              <Code fontSize="xs">{(data.sparsity * 100).toFixed(2)}%</Code>
            </HStack>
          )}
        </VStack>

        <VStack gap={1} align="stretch" mt={2}>
          <Text fontSize="xs" fontWeight="medium">
            Top Dimensions:
          </Text>
          <Box maxH="150px" overflowY="auto">
            {data.top_dims.slice(0, 10).map((dim, idx) => (
              <HStack key={idx} fontSize="xs">
                <Code>{dim}</Code>
                <Text>→</Text>
                <Code>{data.top_vals[idx]?.toFixed(4) || "N/A"}</Code>
              </HStack>
            ))}
          </Box>
        </VStack>
      </VStack>
    </Box>
  );
}
