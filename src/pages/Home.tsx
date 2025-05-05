import {
  Container,
  Grid,
  Heading,
  Text,
  VStack,
  SimpleGrid,
  Link,
  Image,
  HStack,
  Button,
  Tag,
  Stack,
} from "@chakra-ui/react";
import postsData from "../data/posts.json";

const Home = () => {
  const { posts } = postsData;
  return (
    <Container maxW="container.xl" py={8} height="calc(100vh - 130px)">
      <Grid
        templateColumns={{ base: "1fr", md: "1fr 3fr" }}
        gap="100px"
        height="100%"
      >
        <VStack align="start" gap={8} width="100%">
          <Stack width="100%" position="relative">
            <Image
              src="/profile.jpg"
              alt="Karthik Badam"
              borderRadius="full"
              width="100%"
              maxWidth="200px"
              height="auto"
              objectFit="cover"
              boxShadow="2xl"
              transition="transform 0.3s"
              _hover={{ transform: "scale(1.05)" }}
            />
          </Stack>
          <Stack>
            <Heading
              size="xl"
              css={{
                background: "linear-gradient(to right, #4299e1, #9f7aea)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Karthik Badam
            </Heading>
            <HStack gap={2} wrap="wrap">
              <Tag.Root>
                <Tag.Label>Research Engineer</Tag.Label>
              </Tag.Root>
              <Tag.Root>
                <Tag.Label>Apple</Tag.Label>
              </Tag.Root>
              <Tag.Root>
                <Tag.Label>Machine Learning</Tag.Label>
              </Tag.Root>
            </HStack>
            <Text fontSize="md" color="gray.600" lineHeight="tall">
              Creating tools for exploration, explanation, and augmentation of
              data that feeds into modern large language models at Apple.
            </Text>
            <HStack gap={4}>
              <Link href="/publications">
                <Button colorScheme="blue" size="sm" variant="outline">
                  View Publications
                </Button>
              </Link>
              <Button colorScheme="purple" size="sm" variant="outline">
                Contact Me
              </Button>
            </HStack>
          </Stack>
        </VStack>
        <Stack>
          <Heading size="xl">Posts and Prototypes</Heading>
          <SimpleGrid
            columns={{ base: 1, md: 2, "2xl": 3 }}
            gap={8}
            height="calc(100vh - 150px)"
            overflowY="auto"
            pb={10}
          >
            {posts.map((post, index) => (
              <Link
                key={index}
                href={post.link}
                _hover={{ textDecoration: "none" }}
              >
                <Stack
                  p={6}
                  borderWidth="1px"
                  borderRadius="xl"
                  _hover={{ transform: "translateY(-4px)", shadow: "xl" }}
                  transition="all 0.3s"
                  bg="gray.subtle"
                >
                  <Heading size="md">{post.title}</Heading>
                  <Text color="gray.focusRing" fontSize="sm" lineClamp={3}>
                    {post.abstract}
                  </Text>
                  <HStack gap={2}>
                    <Tag.Root>
                      <Tag.Label>Read More</Tag.Label>
                    </Tag.Root>
                    {post.video && (
                      <Tag.Root>
                        <Tag.Label>Video</Tag.Label>
                      </Tag.Root>
                    )}
                  </HStack>
                </Stack>
              </Link>
            ))}
          </SimpleGrid>
        </Stack>
      </Grid>
    </Container>
  );
};

export default Home;
