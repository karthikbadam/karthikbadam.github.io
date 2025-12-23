import { Box, HStack, Text, Link, Icon } from "@chakra-ui/react";
import { LuExternalLink } from "react-icons/lu";

interface StarInfoOverlayProps {
  sourceId: string;
}

/**
 * Overlay displaying star info with links to SIMBAD and Gaia@AIP
 */
export function StarInfoOverlay({ sourceId }: StarInfoOverlayProps) {
  const simbadUrl = `https://simbad.cds.unistra.fr/simbad/sim-basic?Ident=${encodeURIComponent(
    `Gaia DR3 ${sourceId}`
  )}`;
  const gaiaUrl = `https://gaia.aip.de/gaia/viewer/${sourceId}/`;

  return (
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
          Gaia DR3 {sourceId}
        </Text>
        <Link
          href={simbadUrl}
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
          href={gaiaUrl}
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
  );
}

