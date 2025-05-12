import {
  Box,
  Code,
  Container,
  Heading,
  HeadingProps,
  Link,
  ListItem,
  Text,
  TextProps,
} from "@chakra-ui/react";
import React from "react";
import { useParams } from "react-router-dom";

// Import all blog posts
import UnderstandingEmbeddings from "../content/blog/understanding-embeddings.mdx";

const blogPosts = {
  "understanding-embeddings": UnderstandingEmbeddings,
};

interface MDXComponentProps {
  children?: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}

const components = {
  h1: (props: HeadingProps) => <Heading as="h1" size="2xl" mb={8} {...props} />,
  h2: (props: HeadingProps) => (
    <Heading
      as="h2"
      size="lg"
      mb={2}
      mt={8}
      color="gray.focusRing"
      {...props}
    />
  ),
  h3: (props: HeadingProps) => (
    <Heading as="h3" size="md" mb={2} mt={8} color="gray.subtle" {...props} />
  ),
  p: (props: TextProps) => (
    <Text mb={4} lineHeight="tall" fontSize="md" {...props} />
  ),
  a: (props: MDXComponentProps) => <Link color="blue.500" {...props} />,
  code: (props: MDXComponentProps) => {
    // Check if this is an inline code block or a fenced code block
    if (props.className?.includes("language-")) {
      // This is a fenced code block, let Prism handle it
      return <Box as="pre" {...props} />;
    }
    // This is an inline code block, use Chakra UI's Code component
    return <Box as="pre" p={1} borderRadius="md" {...props} />;
  },
  pre: (props: MDXComponentProps) => (
    <Code borderRadius="md" overflowX="auto" mb={4} {...props} />
  ),
  ul: (props: MDXComponentProps) => (
    <Box as="ul" mb={4} ml={6} listStyleType="disc" {...props} />
  ),
  ol: (props: MDXComponentProps) => (
    <Box as="ol" mb={4} ml={6} listStyleType="decimal" {...props} />
  ),
  li: (props: MDXComponentProps) => <ListItem mb={2} {...props} />,
};

export const BlogPost: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const Post = blogPosts[slug as keyof typeof blogPosts];

  if (!Post) {
    return (
      <Container maxW="72ch" py={8}>
        <Text>Blog post not found</Text>
      </Container>
    );
  }

  return (
    <Container maxW="72ch" py={8}>
      <Box as="article" className="mdx-content">
        <Post components={components}></Post>
      </Box>
    </Container>
  );
};
