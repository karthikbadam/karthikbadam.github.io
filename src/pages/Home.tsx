import {
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
import { useColorModeValue } from "../components/ui/color-mode";
import featuredData from "../data/featured.json";

const Home = () => {
  const highlightColor = useColorModeValue("#948979", "#DFD0B8");
  const [firstPost, ...restPosts] = featuredData;

  return (
    <Container maxW="container.xl" py={8} px={8} height="calc(100vh - 130px)">
      <Grid
        templateColumns={{ base: "1fr", md: "1fr 3fr" }}
        gap="100px"
        height="100%"
      >
        <VStack align="start" gap={6} width="100%">
          <Stack width="100%" position="relative" mt={10}>
            <Image
              src="/profile.jpg"
              alt="Karthik Badam"
              borderRadius="full"
              width="100%"
              maxWidth="150px"
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
                background: highlightColor,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Karthik Badam
            </Heading>
            <HStack gap={2} wrap="wrap">
              <Tag.Root>
                <Tag.Label>Full-Stack Engineer</Tag.Label>
              </Tag.Root>
              <Tag.Root>
                <Tag.Label>Apple</Tag.Label>
              </Tag.Root>
              <Tag.Root>
                <Tag.Label>Machine Learning</Tag.Label>
              </Tag.Root>
            </HStack>
            <Text fontSize="md" color="gray.fg" lineHeight="tall">
              Creating tools to explore, explain, and augment datasets that feed
              into large language and vision models.
            </Text>
          </Stack>
        </VStack>
        <Stack gap={4}>
          <Heading size="xl">Featured Works</Heading>
          {/* Large Card for First Post */}
          <Link href={firstPost.link} _hover={{ textDecoration: "none" }}>
            <Grid
              templateColumns={{ base: "1fr", md: "auto 1fr" }}
              gap={8}
              p={6}
              borderWidth="1px"
              borderRadius="xl"
              _hover={{ transform: "translateY(-4px)", shadow: "xl" }}
              transition="all 0.3s"
            >
              <Image
                src={`/images/${firstPost.image}`}
                alt={firstPost.title}
                borderRadius="lg"
                objectFit="contain"
                height="200px"
                width="100%"
              />
              <Stack gap={4}>
                <Heading size="lg">{firstPost.title}</Heading>
                <Text color="gray.focusRing" fontSize="md">
                  {firstPost.abstract}
                </Text>
                <HStack gap={2}>
                  <Tag.Root>
                    <Tag.Label>{firstPost.type}</Tag.Label>
                  </Tag.Root>
                  {firstPost.video && (
                    <Tag.Root>
                      <Tag.Label>Video</Tag.Label>
                    </Tag.Root>
                  )}
                </HStack>
              </Stack>
            </Grid>
          </Link>

          {/* Grid for Smaller Cards */}
          <Grid
            templateColumns={{
              base: "1fr",
              md: "1fr 1fr",
            }}
            gap={4}
          >
            {restPosts.map((post, index) => (
              <Link
                key={index}
                href={post.link}
                _hover={{ textDecoration: "none" }}
                h="100%"
              >
                <Stack
                  p={6}
                  borderWidth="1px"
                  borderRadius="xl"
                  _hover={{ transform: "translateY(-4px)", shadow: "xl" }}
                  transition="all 0.3s"
                  gap={6}
                  h="100%"
                >
                  <Stack gap={2}>
                    <Heading size="md">{post.title}</Heading>
                    <Text color="gray.focusRing" fontSize="sm" lineClamp={2}>
                      {post.abstract}
                    </Text>
                    <HStack gap={2}>
                      <Tag.Root>
                        <Tag.Label>{post.type}</Tag.Label>
                      </Tag.Root>
                      {post.video && (
                        <Tag.Root>
                          <Tag.Label>Video</Tag.Label>
                        </Tag.Root>
                      )}
                    </HStack>
                  </Stack>
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
