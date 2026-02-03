import { Box, Text } from "@chakra-ui/react";
import { useTransformer } from "../../../../contexts/TransformerContext";
import { TokenDetailsPanel } from "./TokenDetailsPanel";
import { LayerDetailsPanel } from "./LayerDetailsPanel";

/**
 * DetailsPanel - Right panel showing token and/or layer details based on selection
 */
export function DetailsPanel() {
  const { highlightedToken, highlightedLayer } = useTransformer();

  const showTokenDetails = highlightedToken !== null;
  const showLayerDetails = highlightedLayer !== null;

  return (
    <Box h="100%" display="flex" flexDirection="column" gap={2}>
      {!showTokenDetails && !showLayerDetails ? (
        <Box textAlign="center" pt={8}>
          <Text fontSize="xs" color="fg.muted">
            Select a token or layer to see details
          </Text>
        </Box>
      ) : (
        <>
          {showTokenDetails && (
            <TokenDetailsPanel position={highlightedToken!} />
          )}

          {showLayerDetails && (
            <LayerDetailsPanel layer={highlightedLayer!} />
          )}
        </>
      )}
    </Box>
  );
}
