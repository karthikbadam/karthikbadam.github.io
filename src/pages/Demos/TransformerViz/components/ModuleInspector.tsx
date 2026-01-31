import {
  Box,
  VStack,
  Accordion,
  Text,
  Button,
} from "@chakra-ui/react";
import { useTransformer } from "../../../../contexts/TransformerContext";
import { useState } from "react";
import { TokenHeadHeatmap } from "./TokenHeadHeatmap";
import { AttentionMatrix } from "./AttentionMatrix";
import { TokenLayerHeatmapSlice } from "./TokenLayerHeatmapSlice";
import { TopKHeadsStrip } from "./TopKHeadsStrip";
import { ActivationInspector } from "./ActivationInspector";
import { LayerNormHeatmap } from "./LayerNormHeatmap";

export function ModuleInspector() {
  const {
    selectedMode,
    selectedMetric,
    selectedLayerRange,
    selectedTokenRange,
    promptTokens,
  } = useTransformer();

  const [expandedSections, setExpandedSections] = useState<string[]>([
    "hidden",
    selectedMode === "attention" ? "attention" : "",
    selectedMode === "mlp" ? "mlp" : "",
    selectedMode === "contribution" ? "contribution" : "",
  ].filter(Boolean));

  const [inspectedCell, setInspectedCell] = useState<{
    layer: number;
    position: number;
    type: "hidden" | "mlp";
  } | null>(null);

  const selectedLayer =
    selectedLayerRange && selectedLayerRange[0] === selectedLayerRange[1]
      ? selectedLayerRange[0]
      : null;

  return (
    <Box
      w="100%"
      h="100%"
      bg="bg.surface"
      border="1px solid"
      borderColor="border"
      borderRadius="md"
      p={2}
      overflowY="auto"
    >
      <VStack gap={2} align="stretch">
        <Text fontSize="sm" fontWeight="bold" color="gray.fg" mb={2}>
          Module Inspector
        </Text>

        <Accordion.Root
          multiple
          value={expandedSections}
          onValueChange={(details) => {
            setExpandedSections(details.value);
          }}
        >
          {/* Hidden Section */}
          <Accordion.Item value="hidden">
            <Accordion.ItemTrigger>
              <Box flex="1" textAlign="left">
                <Text fontSize="sm" fontWeight="medium">
                  Hidden States
                </Text>
              </Box>
            </Accordion.ItemTrigger>
            <Accordion.ItemContent pb={4}>
              <VStack gap={2} align="stretch">
                <Text fontSize="xs" color="gray.fg">
                  Token × Layer heatmap for hidden metrics
                </Text>
                {selectedMetric && (selectedMetric === 'hidden_norm' || selectedMetric === 'cosine_similarity_prev_layer') ? (
                  <Box h="300px">
                    <TokenLayerHeatmapSlice
                      metric={selectedMetric}
                      title="Hidden States"
                      subtitle={`${selectedMetric}`}
                      tableName="hidden_metrics"
                    />
                  </Box>
                ) : (
                  <Text fontSize="xs" color="gray.500" fontStyle="italic">
                    Select a hidden metric (hidden_norm or cosine_similarity_prev_layer)
                  </Text>
                )}
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    if (selectedLayerRange && selectedLayerRange[0] === selectedLayerRange[1]) {
                      const layer = selectedLayerRange[0];
                      const position = selectedTokenRange
                        ? selectedTokenRange[0]
                        : promptTokens.length > 0
                        ? promptTokens[0].position
                        : 0;
                      setInspectedCell({ layer, position, type: "hidden" });
                    }
                  }}
                >
                  Inspect Raw Vector
                </Button>
                {inspectedCell && inspectedCell.type === "hidden" && (
                  <ActivationInspector
                    layer={inspectedCell.layer}
                    position={inspectedCell.position}
                    type="hidden"
                    onClose={() => setInspectedCell(null)}
                  />
                )}
              </VStack>
            </Accordion.ItemContent>
          </Accordion.Item>

          {/* Attention Section */}
          {(selectedMode === "attention" || selectedLayer !== null) && (
            <Accordion.Item value="attention">
              <Accordion.ItemTrigger>
                <Box flex="1" textAlign="left">
                  <Text fontSize="sm" fontWeight="medium">
                    Attention
                  </Text>
                </Box>
              </Accordion.ItemTrigger>
              <Accordion.ItemContent pb={4}>
                <VStack gap={2} align="stretch">
                  <Text fontSize="xs" color="gray.fg">
                    Head metrics heatmap (Token × Head)
                  </Text>
                  {selectedLayer !== null && selectedMetric ? (
                    <Box h="300px">
                      <TokenHeadHeatmap
                        layer={selectedLayer}
                        metric={selectedMetric}
                        title="Attention Head Metrics"
                      />
                    </Box>
                  ) : (
                    <Text fontSize="xs" color="gray.500" fontStyle="italic">
                      Select a layer to view Token × Head heatmap
                    </Text>
                  )}
                  <Text fontSize="xs" color="gray.fg" mt={2}>
                    Attention weights matrix (Token × Token)
                  </Text>
                  {selectedLayer !== null ? (
                    <>
                      <Text fontSize="xs" color="gray.fg" mb={1}>
                        Select a head to view attention matrix (showing head 0 by default)
                      </Text>
                      <Box h="300px">
                        <AttentionMatrix
                          layer={selectedLayer}
                          head={0}
                          title="Attention Weights"
                        />
                      </Box>
                      <Text fontSize="xs" color="gray.500" fontStyle="italic" mt={2}>
                        Note: Attention scores (pre-softmax) are unavailable unless
                        SAVE_ATTENTION_SCORES=true.
                      </Text>
                    </>
                  ) : (
                    <Text fontSize="xs" color="gray.500" fontStyle="italic">
                      Select a layer to view attention matrix
                    </Text>
                )}
              </VStack>
              </Accordion.ItemContent>
            </Accordion.Item>
          )}

          {/* MLP Section */}
          {selectedMode === "mlp" && (
            <Accordion.Item value="mlp">
              <Accordion.ItemTrigger>
                <Box flex="1" textAlign="left">
                  <Text fontSize="sm" fontWeight="medium">
                    MLP
                  </Text>
                </Box>
              </Accordion.ItemTrigger>
              <Accordion.ItemContent pb={4}>
              <VStack gap={2} align="stretch">
                <Text fontSize="xs" color="gray.fg">
                  Token × Layer heatmap for MLP metrics
                </Text>
                {selectedMetric && ['gate_sparsity_proxy', 'topk_energy_fraction', 'gate_l2_norm', 'up_l2_norm', 'down_l2_norm'].includes(selectedMetric) ? (
                  <Box h="300px">
                    <TokenLayerHeatmapSlice
                      metric={selectedMetric}
                      title="MLP Activations"
                      subtitle={`${selectedMetric}`}
                      tableName="mlp_metrics"
                    />
                  </Box>
                ) : (
                  <Text fontSize="xs" color="gray.500" fontStyle="italic">
                    Select an MLP metric
                  </Text>
                )}
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    if (selectedLayerRange && selectedLayerRange[0] === selectedLayerRange[1]) {
                      const layer = selectedLayerRange[0];
                      const position = selectedTokenRange
                        ? selectedTokenRange[0]
                        : promptTokens.length > 0
                        ? promptTokens[0].position
                        : 0;
                      setInspectedCell({ layer, position, type: "mlp" });
                    }
                  }}
                >
                  Inspect Raw Activations
                </Button>
                {inspectedCell && inspectedCell.type === "mlp" && (
                  <ActivationInspector
                    layer={inspectedCell.layer}
                    position={inspectedCell.position}
                    type="mlp"
                    onClose={() => setInspectedCell(null)}
                  />
                )}
              </VStack>
              </Accordion.ItemContent>
            </Accordion.Item>
          )}

          {/* Contribution Section */}
          {selectedMode === "contribution" && (
            <Accordion.Item value="contribution">
              <Accordion.ItemTrigger>
                <Box flex="1" textAlign="left">
                  <Text fontSize="sm" fontWeight="medium">
                    Head Contribution
                  </Text>
                </Box>
              </Accordion.ItemTrigger>
              <Accordion.ItemContent pb={4}>
                <VStack gap={2} align="stretch">
                  <Text fontSize="xs" color="gray.fg">
                    Token × Head heatmap for selected layer
                  </Text>
                  {selectedLayer !== null && selectedMetric ? (
                    <Box h="300px">
                      <TokenHeadHeatmap
                        layer={selectedLayer}
                        metric={selectedMetric}
                        title="Head Contribution"
                      />
                    </Box>
                  ) : (
                    <Text fontSize="xs" color="gray.500" fontStyle="italic">
                      Select a layer to view contribution heatmap
                    </Text>
                  )}
                  <Text fontSize="xs" color="gray.fg" mt={2}>
                    Top-K heads facet strip
                  </Text>
                  {selectedLayer !== null && selectedMetric && ['contrib_l2', 'contrib_to_argmax_logit_normed'].includes(selectedMetric) ? (
                    <TopKHeadsStrip
                      layer={selectedLayer}
                      metric={selectedMetric as "contrib_l2" | "contrib_to_argmax_logit_normed"}
                      k={5}
                    />
                  ) : (
                    <Text fontSize="xs" color="gray.500" fontStyle="italic">
                      Select a contribution metric to view top-k heads
                    </Text>
                )}
              </VStack>
              </Accordion.ItemContent>
            </Accordion.Item>
          )}

          {/* LayerNorm Diagnostics (only when explicitly selected) */}
          {selectedMode === "overview" && (
            <Accordion.Item value="layernorm">
              <Accordion.ItemTrigger>
                <Box flex="1" textAlign="left">
                  <Text fontSize="sm" fontWeight="medium">
                    LayerNorm Diagnostics
                  </Text>
                </Box>
              </Accordion.ItemTrigger>
              <Accordion.ItemContent pb={4}>
                <VStack gap={2} align="stretch">
                  <Text fontSize="xs" color="gray.fg">
                    Token × Layer heatmap for variance/mean
                  </Text>
                  <Box h="300px">
                    <LayerNormHeatmap metric="mean" />
                  </Box>
                  <Box h="300px">
                    <LayerNormHeatmap metric="variance" />
                  </Box>
                </VStack>
              </Accordion.ItemContent>
            </Accordion.Item>
          )}
        </Accordion.Root>
      </VStack>
    </Box>
  );
}
