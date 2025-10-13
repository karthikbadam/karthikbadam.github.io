import { Box, Code, Heading, Text, Portal } from "@chakra-ui/react";
import { CloseButton } from "@chakra-ui/react";
import React from "react";

interface InspectorProps {
  data: Record<string, unknown> | null;
  title?: string;
  keys?: string[]; // Keys to display in order, if not provided shows all
  onClose: () => void;
}

export const RecordInspector: React.FC<InspectorProps> = ({
  data,
  title,
  keys,
  onClose,
}) => {
  if (!data) return null;

  const displayTitle = title || (data.name as string) || "Inspector";

  // Format value for display
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "N/A";
    if (typeof value === "number") {
      // Format numbers nicely
      return value % 1 === 0 ? value.toString() : value.toFixed(3);
    }
    if (typeof value === "object") {
      const str = JSON.stringify(value, null, 2);
      // Limit to 10 lines for large objects
      const lines = str.split("\n");
      if (lines.length > 10) {
        return lines.slice(0, 10).join("\n") + "\n... (truncated)";
      }
      return str;
    }
    // Limit string length to avoid huge text blocks
    const str = String(value);
    if (str.length > 500) {
      return str.substring(0, 500) + "... (truncated)";
    }
    return str;
  };

  // Get keys to display
  const displayKeys = keys || Object.keys(data);

  return (
    <Portal>
      <>
        {/* Backdrop */}
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="blackAlpha.600"
          zIndex={1000}
          onClick={onClose}
        />
        {/* Drawer */}
        <Box
          position="fixed"
          top={0}
          right={0}
          bottom={0}
          width={{ base: "100%", md: "500px" }}
          bg="bg"
          boxShadow="xl"
          zIndex={1001}
          overflowY="auto"
          p={6}
        >
          <CloseButton
            position="absolute"
            top={4}
            right={4}
            onClick={onClose}
          />

          <Heading size="md" mb={6}>
            {displayTitle}
          </Heading>

          <Box>
            {displayKeys.map((key) => {
              const value = data[key];
              if (value === null || value === undefined) return null;

              const isObject = typeof value === "object";

              return (
                <Box key={key} mb={4}>
                  <Text fontWeight="bold" fontSize="sm" mb={1}>
                    {key}:
                  </Text>
                  {isObject ? (
                    <Code
                      display="block"
                      p={2}
                      fontSize="xs"
                      whiteSpace="pre-wrap"
                      maxH="200px"
                      overflowY="auto"
                    >
                      {formatValue(value)}
                    </Code>
                  ) : (
                    <Text fontSize="sm">{formatValue(value)}</Text>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      </>
    </Portal>
  );
};
