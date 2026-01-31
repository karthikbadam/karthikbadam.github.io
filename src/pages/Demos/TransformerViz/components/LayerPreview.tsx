import { Box, Popover } from "@chakra-ui/react";
import { TokenHeadHeatmap } from "./TokenHeadHeatmap";
import { useTransformer } from "../../../../contexts/TransformerContext";

interface LayerPreviewProps {
  layer: number;
  children: React.ReactNode;
}

export function LayerPreview({ layer, children }: LayerPreviewProps) {
  const { selectedPromptId, selectedMetric } = useTransformer();

  if (selectedPromptId === null || !selectedMetric) {
    return <>{children}</>;
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content w="400px" maxH="400px" overflowY="auto">
          <Popover.Body p={2}>
            <Box h="300px">
              <TokenHeadHeatmap
                layer={layer}
                metric={selectedMetric}
                title={`Layer ${layer} Preview`}
              />
            </Box>
          </Popover.Body>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  );
}
