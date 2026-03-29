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
import postsData from "../data/explorations.json";

interface Post {
  title: string;
  date: string;
  abstract: string;
  link: string;
  video?: string;
  linkLabel?: string;
  github?: string;
}

const outlineBtnProps = {
  size: "sm" as const,
  variant: "outline" as const,
  color: "accent" as const,
  borderColor: "accent",
  _hover: { bg: "accentSubtle", color: "gray.contrast" },
};

function primaryButtonLabel(link: string, linkLabel?: string): string {
  if (linkLabel) return linkLabel;
  if (link.startsWith("mailto:")) return "Visit";
  if (link.startsWith("http")) {
    try {
      const host = new URL(link).hostname;
      if (host === "karthikbadam.github.io") return "Live Demo";
    } catch {
      /* ignore invalid URL */
    }
    return "Visit";
  }
  return "Live Demo";
}

function isInternalLink(url: string): boolean {
  return Boolean(url) && !url.startsWith("http") && !url.startsWith("mailto:");
}

export const Explorations = () => {
  const { posts } = postsData as { posts: Post[] };

  return (
    <Page>
      <Container maxW="100ch" py={4}>
        <VStack gap={4} align="stretch">
          <Heading color="accent">Explorations</Heading>
          {posts.map((post, index) => (
            <Box
              key={index}
              p={4}
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
              <HStack mt={2} gap={4} flexWrap="wrap">
                {isInternalLink(post.link) ? (
                  <RouterLink to={post.link}>
                    <Button {...outlineBtnProps}>
                      {primaryButtonLabel(post.link, post.linkLabel)}
                    </Button>
                  </RouterLink>
                ) : (
                  <ChakraLink
                    href={post.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button {...outlineBtnProps}>
                      {primaryButtonLabel(post.link, post.linkLabel)}
                    </Button>
                  </ChakraLink>
                )}
                {post.github && (
                  <ChakraLink
                    href={post.github}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button {...outlineBtnProps}>GitHub Source</Button>
                  </ChakraLink>
                )}
                {post.video && (
                  <ChakraLink
                    href={post.video}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button {...outlineBtnProps}>Watch Video</Button>
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
