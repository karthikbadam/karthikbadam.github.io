import {
  Box,
  VStack,
  HStack,
  NativeSelect,
  Button,
  Text,
  Switch,
} from "@chakra-ui/react";
import { useTransformer } from "../../../../contexts/TransformerContext";
import { useMemo } from "react";

export function FacetControls() {
  const {
    selectedMode,
    setSelectedMode,
    selectedMetric,
    setSelectedMetric,
    aggregationMethod,
    setAggregationMethod,
    advancedMode,
    setAdvancedMode,
  } = useTransformer();

  // Mode-specific metric options
  const metricOptions = useMemo(() => {
    switch (selectedMode) {
      case "overview":
        return [
          { value: "hidden_norm", label: "Hidden Norm" },
          { value: "entropy", label: "Attention Entropy" },
          { value: "gate_sparsity_proxy", label: "Gate Sparsity" },
          { value: "contrib_to_argmax_logit_normed", label: "Contribution (Normed)" },
        ];
      case "attention":
        return [
          { value: "entropy", label: "Entropy" },
          { value: "top1_mass", label: "Top-1 Mass" },
          { value: "topk_mass", label: "Top-K Mass" },
          { value: "diagonal_mass", label: "Diagonal Mass" },
          { value: "band_mass", label: "Band Mass" },
        ];
      case "mlp":
        return [
          { value: "gate_sparsity_proxy", label: "Gate Sparsity" },
          { value: "topk_energy_fraction", label: "Top-K Energy" },
          { value: "gate_l2_norm", label: "Gate L2 Norm" },
          { value: "up_l2_norm", label: "Up L2 Norm" },
          { value: "down_l2_norm", label: "Down L2 Norm" },
        ];
      case "contribution":
        return [
          { value: "contrib_l2", label: "Contribution L2" },
          { value: "contrib_to_argmax_logit", label: "Contribution to Argmax" },
          { value: "contrib_to_argmax_logit_normed", label: "Contribution (Normed)" },
        ];
      default:
        return [];
    }
  }, [selectedMode]);

  // Aggregation options (constrained by mode)
  const aggregationOptions = useMemo(() => {
    if (selectedMode === "mlp" || selectedMode === "overview") {
      // No head dimension, no aggregation needed
      return [{ value: "mean", label: "N/A" }];
    }
    return [
      { value: "mean", label: "Mean" },
      { value: "max", label: "Max" },
      { value: "min", label: "Min" },
      ...(selectedMode === "contribution" || advancedMode
        ? [{ value: "topk_mean", label: "Top-K Mean" }]
        : []),
    ];
  }, [selectedMode, advancedMode]);

  // Set default metric when mode changes
  const handleModeChange = (mode: "overview" | "attention" | "mlp" | "contribution") => {
    setSelectedMode(mode);
    // Set default metric for mode
    switch (mode) {
      case "overview":
        setSelectedMetric("hidden_norm");
        break;
      case "attention":
        setSelectedMetric("entropy");
        break;
      case "mlp":
        setSelectedMetric("gate_sparsity_proxy");
        break;
      case "contribution":
        setSelectedMetric("contrib_to_argmax_logit_normed");
        break;
    }
  };

  return (
    <Box w="100%" bg="bg.surface" p={3}>
      <VStack gap={3} align="stretch">
        <Text fontSize="sm" fontWeight="bold" color="gray.fg">
          Controls
        </Text>

        {/* Mode selector */}
        <Box>
          <Text fontSize="xs" mb={1}>Mode</Text>
          <HStack gap={2}>
            <Button
              size="xs"
              colorScheme={selectedMode === "overview" ? "blue" : "gray"}
              onClick={() => handleModeChange("overview")}
            >
              Overview
            </Button>
            <Button
              size="xs"
              colorScheme={selectedMode === "attention" ? "blue" : "gray"}
              onClick={() => handleModeChange("attention")}
            >
              Attention
            </Button>
            <Button
              size="xs"
              colorScheme={selectedMode === "mlp" ? "blue" : "gray"}
              onClick={() => handleModeChange("mlp")}
            >
              MLP
            </Button>
            <Button
              size="xs"
              colorScheme={selectedMode === "contribution" ? "blue" : "gray"}
              onClick={() => handleModeChange("contribution")}
            >
              Contribution
            </Button>
          </HStack>
        </Box>

        {/* Metric selector */}
        <Box>
          <Text fontSize="xs" mb={1}>Metric</Text>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field
              value={selectedMetric}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedMetric(e.target.value)}
            >
              {metricOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </NativeSelect.Field>
          </NativeSelect.Root>
        </Box>

        {/* Aggregation selector (only for head-aware metrics) */}
        {(selectedMode === "attention" ||
          selectedMode === "contribution" ||
          advancedMode) && (
          <Box>
            <Text fontSize="xs" mb={1}>Aggregation</Text>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field
                value={aggregationMethod}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setAggregationMethod(
                    e.target.value as "mean" | "max" | "min" | "topk_mean"
                  )
                }
              >
                {aggregationOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </NativeSelect.Field>
            </NativeSelect.Root>
          </Box>
        )}

        {/* Advanced toggle */}
        <Box display="flex" alignItems="center" gap={2}>
          <Text fontSize="xs">Advanced</Text>
          <Switch.Root
            size="sm"
            checked={advancedMode}
            onCheckedChange={(e) => setAdvancedMode(e.checked)}
          >
            <Switch.Thumb />
          </Switch.Root>
        </Box>
      </VStack>
    </Box>
  );
}
