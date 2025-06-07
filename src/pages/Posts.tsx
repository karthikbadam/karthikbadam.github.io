import {
  Container,
  Heading,
  VStack,
  Text,
  Box,
  Link as ChakraLink,
  Button,
  HStack,
} from "@chakra-ui/react";
import { Link as RouterLink } from "react-router-dom";
import postsData from "../data/posts.json";
import { Page } from "../components/Page";

interface Post {
  title: string;
  date: string;
  abstract: string;
  link: string;
  video?: string;
}

export const Posts = () => {
  const { posts } = postsData as { posts: Post[] };

  // Helper function to determine if a link is internal or external
  const isInternalLink = (url: string): boolean => {
    return Boolean(url) && !url.startsWith('http') && !url.startsWith('mailto:');
  };

  return (
    <Page>
      <Container maxW="100ch" py={8}>
      <VStack gap={4} align="stretch">
        <Heading size="2xl">Posts</Heading>
        {posts.map((post, index) => (
          <Box
            key={index}
            p={6}
            borderWidth="1px"
            borderRadius="lg"
            _hover={{ shadow: "md" }}
          >
            {isInternalLink(post.link) ? (
              <RouterLink to={post.link} style={{ textDecoration: "none" }}>
                <Heading size="md">{post.title}</Heading>
              </RouterLink>
            ) : (
              <ChakraLink
                href={post.link}
                textDecoration="none"
                _hover={{ textDecoration: "none", color: "blue.fg" }}
              >
                <Heading size="md">{post.title}</Heading>
              </ChakraLink>
            )}
            <Text color="gray.fg" mt={2}>
              {post.date}
            </Text>
            <Text mt={4}>{post.abstract}</Text>
            <HStack mt={4} gap={4}>
              {isInternalLink(post.link) ? (
                <RouterLink to={post.link}>
                  <Button colorScheme="blue" size="sm">
                    Read More
                  </Button>
                </RouterLink>
              ) : (
                <ChakraLink href={post.link} target="_blank" rel="noopener noreferrer">
                  <Button colorScheme="blue" size="sm">
                    Read More
                  </Button>
                </ChakraLink>
              )}
              {post.video && (
                <ChakraLink
                  href={post.video}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button colorScheme="red" size="sm">
                    Watch Video
                  </Button>
                </ChakraLink>
              )}
            </HStack>
          </Box>
        ))}
      </VStack>
      </Container>
    </Page>
  );
};
