// TrajectoryPanel — chrome for an icicle / sankey / table panel.
// Matches the styling of MosaicChart's panel so visually the demo lines up
// with the rest of the site.

import { Box, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

interface TrajectoryPanelProps {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}

export function TrajectoryPanel({ title, subtitle, right, children }: TrajectoryPanelProps) {
  return (
    <Box
      bg="bg"
      borderRadius="lg"
      p={2}
      position="relative"
      h="100%"
      display="flex"
      flexDirection="column"
      border="1px solid"
      borderColor="gray.subtle"
      overflow="hidden"
    >
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} mb={1}>
        <Text fontSize="xs" fontWeight="semibold" color="accentSubtle">
          {title}
          {subtitle && (
            <Text as="span" fontWeight="normal" color="fg.muted" ml={1}>
              {"• "}
              {subtitle}
            </Text>
          )}
        </Text>
        {right}
      </Box>
      <Box flex="1" minH={0} position="relative" borderRadius="md" overflow="hidden">
        {children}
      </Box>
    </Box>
  );
}
