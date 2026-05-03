import { Box, BoxProps } from "@chakra-ui/react";

/**
 * PanelContainer - Consistent container for detail panels
 * Provides standard styling for panel backgrounds, borders, and layout
 */
export function PanelContainer({ children, ...props }: BoxProps) {
  return (
    <Box
      bg="bg"
      borderRadius="lg"
      p={2}
      border="1px solid"
      borderColor="gray.subtle"
      h="100%"
      display="flex"
      flexDirection="column"
      {...props}
    >
      {children}
    </Box>
  );
}
