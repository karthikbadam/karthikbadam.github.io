import {
  Box,
  Code,
  Heading,
  Text,
  VStack,
  Badge,
  Portal,
} from "@chakra-ui/react";
import { CloseButton } from "@chakra-ui/react";
import React from "react";

interface SelectedSpan {
  name: string;
  type?: string;
  span_id?: string;
  parent_id?: string;
  level?: number;
  duration?: number;
  tokens?: number;
  react_phase?: string;
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
}

interface SpanInspectorProps {
  selectedSpan: SelectedSpan | null;
  onClose: () => void;
}

export const SpanInspector: React.FC<SpanInspectorProps> = ({
  selectedSpan,
  onClose,
}) => {
  if (!selectedSpan) return null;

  const renderAttribute = (key: string, value: unknown) => {
    if (value === null || value === undefined) return null;

    // Handle special cases
    if (key === 'duration' && typeof value === 'number') {
      return (
        <Box key={key} mb={2}>
          <Text fontWeight="bold" fontSize="sm">{key}:</Text>
          <Text fontSize="sm">{value.toFixed(3)}s</Text>
        </Box>
      );
    }

    if (key === 'tokens' && typeof value === 'number') {
      return (
        <Box key={key} mb={2}>
          <Text fontWeight="bold" fontSize="sm">{key}:</Text>
          <Text fontSize="sm">{value.toLocaleString()}</Text>
        </Box>
      );
    }

    if (key === 'react_phase' && typeof value === 'string') {
      return (
        <Box key={key} mb={2}>
          <Text fontWeight="bold" fontSize="sm">ReAct Phase:</Text>
          <Badge colorScheme={getReActColor(value)}>{value}</Badge>
        </Box>
      );
    }

    // Handle objects and arrays
    if (typeof value === 'object') {
      return (
        <Box key={key} mb={2}>
          <Text fontWeight="bold" fontSize="sm">{key}:</Text>
          <Code display="block" p={2} fontSize="xs" whiteSpace="pre-wrap">
            {JSON.stringify(value, null, 2)}
          </Code>
        </Box>
      );
    }

    // Default rendering
    return (
      <Box key={key} mb={2}>
        <Text fontWeight="bold" fontSize="sm">{key}:</Text>
        <Text fontSize="sm">{String(value)}</Text>
      </Box>
    );
  };

  const getReActColor = (phase: string): string => {
    switch (phase) {
      case 'thought':
        return 'blue';
      case 'action_llm':
        return 'purple';
      case 'action_code':
        return 'orange';
      case 'observation':
        return 'green';
      default:
        return 'gray';
    }
  };

  return (
    <Portal>
      {!!selectedSpan && (
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
            <Box position="relative">
              <CloseButton
                position="absolute"
                top={0}
                right={0}
                onClick={onClose}
              />
              <Heading size="md" mb={2}>{selectedSpan.name}</Heading>
              {selectedSpan.type && (
                <Badge mt={2} mb={4} colorScheme="blue">{selectedSpan.type}</Badge>
              )}
          <VStack align="stretch" gap={4}>
            {/* Basic Info */}
            <Box>
              <Heading size="sm" mb={2}>Basic Information</Heading>
              {selectedSpan.span_id && renderAttribute('span_id', selectedSpan.span_id)}
              {selectedSpan.parent_id && renderAttribute('parent_id', selectedSpan.parent_id)}
              {selectedSpan.level !== undefined && renderAttribute('level', selectedSpan.level)}
            </Box>

            {/* Metrics */}
            {(selectedSpan.duration !== undefined || selectedSpan.tokens !== undefined) && (
              <Box>
                <Heading size="sm" mb={2}>Metrics</Heading>
                {selectedSpan.duration !== undefined && renderAttribute('duration', selectedSpan.duration)}
                {selectedSpan.tokens !== undefined && renderAttribute('tokens', selectedSpan.tokens)}
              </Box>
            )}

            {/* ReAct Information */}
            {selectedSpan.react_phase && (
              <Box>
                <Heading size="sm" mb={2}>ReAct Pattern</Heading>
                {renderAttribute('react_phase', selectedSpan.react_phase)}
                <Text fontSize="sm" color="gray.fg" mt={2}>
                  {getReActDescription(selectedSpan.react_phase)}
                </Text>
              </Box>
            )}

            {/* Attributes */}
            {selectedSpan.attributes && Object.keys(selectedSpan.attributes).length > 0 && (
              <Box>
                <Heading size="sm" mb={2}>Attributes</Heading>
                {Object.entries(selectedSpan.attributes)
                  .filter(([key]) => !['span_id', 'parent_id', 'type', 'level', 'duration', 'tokens', 'react_phase'].includes(key))
                  .map(([key, value]) => renderAttribute(key, value))}
              </Box>
            )}

            {/* Full Span Data (collapsed) */}
            <Box>
              <Heading size="sm" mb={2}>Raw Data</Heading>
              <Code display="block" p={2} fontSize="xs" whiteSpace="pre-wrap" maxH="300px" overflowY="auto">
                {JSON.stringify(selectedSpan, null, 2)}
              </Code>
            </Box>
          </VStack>
            </Box>
          </Box>
        </>
      )}
    </Portal>
  );
};

function getReActDescription(phase: string): string {
  switch (phase) {
    case 'thought':
      return 'The reasoning phase where the agent analyzes the problem and plans the next action.';
    case 'action_llm':
      return 'The LLM call phase where the agent generates code or queries.';
    case 'action_code':
      return 'The code execution phase where generated code is run.';
    case 'observation':
      return 'The observation phase where the agent processes the results of actions.';
    default:
      return '';
  }
}

