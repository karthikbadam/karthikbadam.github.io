import { Box, Heading, Text, Portal } from "@chakra-ui/react";
import { CloseButton } from "@chakra-ui/react";
import React from "react";
import ReactJson from "@microlink/react-json-view";
import { useColorModeValue } from "./ui/color-mode";

interface InspectorProps {
  data: Record<string, unknown> | null;
  title?: string;
  onClose: () => void;
}

export const RecordInspector: React.FC<InspectorProps> = ({
  data,
  title,
  onClose,
}) => {
  const jsonTheme = useColorModeValue("rjv-default", "monokai");

  if (!data) return null;

  const displayTitle = title || (data.name as string) || "Inspector";

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "N/A";
    if (typeof value === "number") {
      return value % 1 === 0 ? value.toString() : value.toFixed(3);
    }
    const str = String(value);
    if (str.length > 500) {
      return str.substring(0, 500) + "... (truncated)";
    }
    return str;
  };

  // Try to parse a value as JSON, returns parsed object or null if not valid JSON
  const tryParseJson = (value: unknown): object | null => {
    if (value !== null && typeof value === "object") {
      return value as object;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
          (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
        try {
          return JSON.parse(trimmed);
        } catch {
          return null;
        }
      }
    }
    return null;
  };


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
          left={0}
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
            {Object.keys(data).map((key) => {
              const value = data[key];
              if (value === null || value === undefined) return null;
              const parsedJson = tryParseJson(value);
              return (
                <Box key={key} mb={4}>
                  <Text fontWeight="semibold" fontSize="sm" mb={1}>
                    {key}:
                  </Text>
                  {parsedJson ? (
                    <ReactJson
                      src={parsedJson}
                      theme={jsonTheme}
                      collapsed={1}
                      enableClipboard={false}
                      displayDataTypes={false}
                      displayObjectSize={false}
                      style={{
                        backgroundColor: "transparent",
                        fontSize: "11px",
                      }}
                    />
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
