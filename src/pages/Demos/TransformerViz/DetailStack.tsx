import { useCallback } from "react";
import { Box, Text, NativeSelect } from "@chakra-ui/react";
import { useTransformer } from "../../../contexts/TransformerContext";
import { StackCard } from "./components/StackCard";

export function DetailStack() {
  const {
    state,
    selectedLayer,
    selectedModule,
    selectedNormType,
    stackIndex,
    navigateStack,
  } = useTransformer();

  const handleCardChange = useCallback((e: React.FormEvent<HTMLSelectElement>) => {
    const newIndex = parseInt(e.currentTarget.value, 10);
    const currentIndex = stackIndex;
    navigateStack(newIndex - currentIndex);
  }, [stackIndex, navigateStack]);

  if (state.status !== "ready") {
    return (
      <Box bg="bg.panel" borderRadius="lg" p={4} h="100%">
        <Text>Loading detail view...</Text>
      </Box>
    );
  }

  if (selectedModule === null) {
    return (
      <Box
        bg="bg.panel"
        borderRadius="lg"
        p={4}
        h="100%"
        display="flex"
        alignItems="center"
        justifyContent="center"
        border="1px solid"
        borderColor="gray.subtle"
      >
        <Text color="fg.muted" fontSize="sm">
          Select a component from the architecture graph to view details
        </Text>
      </Box>
    );
  }

  const cardOptions = selectedModule === "attn" 
    ? [
        { value: 0, label: "Input & Projections" },
        { value: 1, label: "Attention Scores" },
        { value: 2, label: "Attention Patterns" },
        { value: 3, label: "Output & Residual" },
      ]
    : selectedModule === "mlp"
    ? [
        { value: 0, label: "Gate & Up Projections" },
        { value: 1, label: "SiLU & Gating" },
        { value: 2, label: "Down & Residual" },
      ]
    : selectedModule === "norm" || selectedModule === "embed"
    ? [
        { value: 0, label: selectedModule === "norm" ? "LayerNorm Parameters" : "Embedding Weights" },
      ]
    : [];

  return (
    <Box
      h="100%"
      display="flex"
      flexDirection="column"
      gap={2}
    >
      {cardOptions.length > 1 && (
        <Box>
          <NativeSelect.Root size="sm" width="100%">
            <NativeSelect.Field value={stackIndex} onChange={handleCardChange}>
              {cardOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Box>
      )}

      {selectedModule === "attn" ? (
        <>
          {stackIndex === 0 && (
            <StackCard
              layer={selectedLayer!}
              module="attn"
              stage={0}
            />
          )}
          {stackIndex === 1 && (
            <StackCard
              layer={selectedLayer!}
              module="attn"
              stage={1}
            />
          )}
          {stackIndex === 2 && (
            <StackCard
              layer={selectedLayer!}
              module="attn"
              stage={2}
            />
          )}
          {stackIndex === 3 && (
            <StackCard
              layer={selectedLayer!}
              module="attn"
              stage={3}
            />
          )}
        </>
      ) : selectedModule === "mlp" ? (
        <>
          {stackIndex === 0 && (
            <StackCard
              layer={selectedLayer!}
              module="mlp"
              stage={0}
            />
          )}
          {stackIndex === 1 && (
            <StackCard
              layer={selectedLayer!}
              module="mlp"
              stage={1}
            />
          )}
          {stackIndex === 2 && (
            <StackCard
              layer={selectedLayer!}
              module="mlp"
              stage={2}
            />
          )}
        </>
      ) : selectedModule === "norm" ? (
        <StackCard
          layer={selectedLayer}
          module="norm"
          stage={0}
          normType={selectedNormType || "input_norm"}
        />
      ) : selectedModule === "embed" ? (
        <StackCard
          layer={null}
          module="embed"
          stage={0}
        />
      ) : null}
    </Box>
  );
}
