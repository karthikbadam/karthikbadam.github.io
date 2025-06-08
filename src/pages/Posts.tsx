import {
  Box,
  Button,
  Link as ChakraLink,
  Container,
  Heading,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Link as RouterLink } from "react-router-dom";
import { Page } from "../components/Page";
import postsData from "../data/posts.json";

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
    return (
      Boolean(url) && !url.startsWith("http") && !url.startsWith("mailto:")
    );
  };

  return (
    <Page>
      <Container maxW="100ch" pb={4}>
        <VStack gap={4} align="stretch">
          <Heading color="accent">Posts</Heading>
          {posts.map((post, index) => (
            <Box
              key={index}
              p={6}
              borderWidth="1px"
              borderRadius="lg"
              fontSize="sm"
            >
              <Heading size="md" color="accent">
                {post.title}
              </Heading>
              <Text color="gray.fg" mt={2}>
                {post.date}
              </Text>
              <Text mt={2}>{post.abstract}</Text>
              <HStack mt={2} gap={4}>
                {isInternalLink(post.link) ? (
                  <RouterLink to={post.link}>
                    <Button
                      size="sm"
                      variant="outline"
                      color="accent"
                      borderColor="accent"
                      _hover={{ bg: "accentSubtle", color: "gray.contrast" }}
                    >
                      Read More
                    </Button>
                  </RouterLink>
                ) : (
                  <ChakraLink
                    href={post.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      color="accent"
                      borderColor="accent"
                      _hover={{ bg: "accentSubtle", color: "gray.contrast" }}
                    >
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
                    <Button
                      size="sm"
                      variant="outline"
                      color="accent"
                      borderColor="accent"
                      _hover={{ bg: "accentSubtle", color: "gray.contrast" }}
                    >
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
