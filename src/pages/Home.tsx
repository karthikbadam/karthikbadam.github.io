import {
  Button,
  Container,
  Grid,
  Heading,
  HStack,
  Image,
  Link,
  Stack,
  Tag,
  Text,
  VStack,
} from "@chakra-ui/react";
import postsData from "../data/posts.json";

const Home = () => {
  const { posts } = postsData;
  return (
    <Container maxW="container.xl" py={8} px={8} height="calc(100vh - 130px)">
      <Grid
        templateColumns={{ base: "1fr", md: "1fr 3fr" }}
        gap="100px"
        height="100%"
      >
        <VStack align="start" gap={8} width="100%">
          <Stack width="100%" position="relative" mt={10}>
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
          <Stack gap={4}>
            <Heading
              size="xl"
              css={{
                background: "linear-gradient(to right, #ECC94B, #ED8936)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Karthik Badam
            </Heading>
            <HStack gap={2} wrap="wrap">
              <Tag.Root bg="orange.subtle">
                <Tag.Label color="orange.fg">Research Engineer</Tag.Label>
              </Tag.Root>
              <Tag.Root bg="orange.subtle">
                <Tag.Label color="orange.fg">Apple</Tag.Label>
              </Tag.Root>
              <Tag.Root bg="orange.subtle">
                <Tag.Label color="orange.fg">Machine Learning</Tag.Label>
              </Tag.Root>
            </HStack>
            <Text fontSize="md" color="gray.fg" lineHeight="tall">
              Creating tools for exploration, explanation, and augmentation of
              data that feeds into large language models.
            </Text>
            <HStack gap={4}>
              <Link href="/publications">
                <Button
                  size="sm"
                  variant="solid"
                  bg="gray.subtle"
                  color="gray.fg"
                >
                  View Publications
                </Button>
              </Link>
              <Button
                size="sm"
                variant="solid"
                bg="gray.subtle"
                color="gray.fg"
              >
                Contact Me
              </Button>
            </HStack>
          </Stack>
        </VStack>
        <Stack gap={2}>
          <Heading size="xl">
            Latest Works
          </Heading>
          <Grid
            templateColumns={{
              base: "1fr",
              md: "1fr 1fr",
              "2xl": "1fr 1fr 1fr",
            }}
            pt={2}
            gap={6}
            maxH="calc(100vh - 150px)"
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
                >
                  <Heading size="md">
                    {post.title}
                  </Heading>
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
          </Grid>
        </Stack>
      </Grid>
    </Container>
  );
};

export default Home;
