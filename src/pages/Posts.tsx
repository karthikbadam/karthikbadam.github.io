import { Container, Heading, VStack, Text, Box, Link, Button, HStack } from "@chakra-ui/react";
import postsData from "../data/posts.json";

const Posts = () => {
  const { posts } = postsData;

  return (
    <Container maxW="container.xl" py={8}>
      <VStack gap={8} align="stretch">
        <Heading 
          size="2xl"
          css={{
            background: "linear-gradient(to right, #63b3ed, #805ad5)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Posts
        </Heading>
        {posts.map((post, index) => (
          <Box
            key={index}
            p={6}
            borderWidth="1px"
            borderRadius="lg"
            _hover={{ shadow: "md" }}
          >
            <Link
              href={post.link}
              textDecoration="none"
              _hover={{ textDecoration: "none", color: "blue.fg" }}
            >
              <Heading size="md">{post.title}</Heading>
            </Link>
            <Text color="gray.fg" mt={2}>
              {post.date}
            </Text>
            <Text mt={4}>{post.abstract}</Text>
            <HStack mt={4} gap={4}>
              <Link href={post.link} target="_blank" rel="noopener noreferrer">
                <Button colorScheme="blue" size="sm">
                  Read More
                </Button>
              </Link>
              {post.video && (
                <Link href={post.video} target="_blank" rel="noopener noreferrer">
                  <Button colorScheme="red" size="sm">
                    Watch Video
                  </Button>
                </Link>
              )}
            </HStack>
          </Box>
        ))}
      </VStack>
    </Container>
  );
};

export default Posts;
