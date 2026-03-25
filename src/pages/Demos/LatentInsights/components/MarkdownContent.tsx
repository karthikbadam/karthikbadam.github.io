import { Box, Code, Text } from "@chakra-ui/react";
import React from "react";
import ReactMarkdown, { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <Text fontWeight="bold" fontSize="sm" mb={1} mt={2}>
      {children}
    </Text>
  ),
  h2: ({ children }) => (
    <Text fontWeight="bold" fontSize="xs" mb={1} mt={2}>
      {children}
    </Text>
  ),
  h3: ({ children }) => (
    <Text fontWeight="semibold" fontSize="xs" mb={1} mt={1}>
      {children}
    </Text>
  ),
  p: ({ children }) => (
    <Text fontSize="xs" lineHeight="1.5" mb={1}>
      {children}
    </Text>
  ),
  ul: ({ children }) => (
    <Box as="ul" fontSize="xs" ml={3} mb={1} css={{ listStyleType: "disc" }}>
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box as="ol" fontSize="xs" ml={3} mb={1} css={{ listStyleType: "decimal" }}>
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Box as="li" mb={0.5} fontSize="xs">
      {children}
    </Box>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <Code
          display="block"
          p={1}
          my={1}
          fontSize="xs"
          fontFamily="mono"
          whiteSpace="pre-wrap"
          wordBreak="break-word"
          borderRadius="sm"
        >
          {children}
        </Code>
      );
    }
    return (
      <Code fontSize="xs" fontFamily="mono" px={0.5}>
        {children}
      </Code>
    );
  },
  pre: ({ children }) => (
    <Box mb={1} overflow="auto">
      {children}
    </Box>
  ),
  table: ({ children }) => (
    <Box as="table" fontSize="xs" fontFamily="mono" mb={1} w="100%">
      {children}
    </Box>
  ),
  strong: ({ children }) => (
    <Text as="span" fontWeight="bold">
      {children}
    </Text>
  ),
};

interface MarkdownContentProps {
  content: string;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content }) => {
  if (!content) return null;
  return (
    <Box>
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </Box>
  );
};
