import {
  Box,
  Link as ChakraLink,
  Container,
  Grid,
  Heading,
  HStack,
  Image,
  Stack,
  Tag,
  Text,
} from "@chakra-ui/react";
import { Link as RouterLink } from "react-router-dom";
import { Page } from "../components/Page";
import { useColorModeValue } from "../components/ui/color-mode";
import { accent } from "../theme";
import featuredData from "../data/featured.json";

// Define types for the post data
interface Post {
  title: string;
  abstract: string;
  type: string;
  link: string;
  video?: string;
  image?:
    | string
    | {
        light: string;
        dark: string;
      };
  bibtex?: string;
  pdf?: string;
  date?: {
    month: string;
    year: number;
  };
  featured?: boolean;
}

export const Home = () => {
  const highlightColor = useColorModeValue(accent.light, accent.dark);
  const featuredPosts = (featuredData as Post[]).filter(
    (post) => post.featured
  );
  const restPosts = (featuredData as Post[]).filter((post) => !post.featured);

  return (
    <Page>
      <Container maxW="container.xl" px={8}>
        <Grid
          templateColumns={{ base: "1fr", md: "300px 1fr" }}
          gap="100px"
          minHeight={{ base: "auto", md: "calc(100vh - 100px)" }}
          mx="auto"
          w="fit-content"
        >
          <Stack
            gap={6}
            position={{ base: "static", md: "sticky" }}
            top={{ base: "auto", md: "0" }}
            height={{ base: "auto", md: "fit-content" }}
            alignSelf={{ base: "stretch", md: "start" }}
          >
            <Stack position="relative" mt={10}>
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
                fontWeight="semibold"
                size="2xl"
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
                Creating tools to explore, explain, and augment datasets that
                feed into large language and vision models.
              </Text>
            </Stack>
          </Stack>
          <Stack py={2}>
            <Stack gap={4} maxW={{ base: "100%", lg: "80ch" }}>
              <Heading size="xl">Featured Works</Heading>
              {/* Featured Posts as Large Cards - Side by Side */}
              {featuredPosts.length > 0 && (
                <Grid
                  templateColumns={{
                    base: "1fr",
                    md: featuredPosts.length === 1 ? "1fr" : "1fr 1fr",
                  }}
                  gap={6}
                >
                  {featuredPosts.map((post, index) => (
                    <FeaturedPostCard key={index} post={post} />
                  ))}
                </Grid>
              )}

              {/* Grid for Smaller Cards */}
              {restPosts.length > 0 && (
                <Grid
                  templateColumns={{
                    base: "1fr",
                    md: "1fr 1fr",
                  }}
                  gap={6}
                >
                  {restPosts.map((post, index) => (
                    <Box key={index}>
                      {post.link.startsWith("http") ? (
                        <ChakraLink
                          href={post.link}
                          _hover={{ textDecoration: "none" }}
                          h="100%"
                        >
                          <PostCard post={post} />
                        </ChakraLink>
                      ) : (
                        <RouterLink
                          to={post.link}
                          style={{ textDecoration: "none" }}
                        >
                          <PostCard post={post} />
                        </RouterLink>
                      )}
                    </Box>
                  ))}
                </Grid>
              )}
            </Stack>
          </Stack>
        </Grid>
      </Container>
    </Page>
  );
};

// Component for individual featured posts
interface FeaturedPostCardProps {
  post: Post;
}

const FeaturedPostCard = ({ post }: FeaturedPostCardProps) => {
  const colorModeImage = useColorModeValue(
    post.image && typeof post.image === "object" ? post.image.light : undefined,
    post.image && typeof post.image === "object" ? post.image.dark : undefined
  );
  const postImage =
    post && typeof post.image === "object"
      ? colorModeImage
      : post && typeof post.image === "string"
      ? post.image
      : undefined;

  return (
    <Box>
      {post.link.startsWith("http") ? (
        <ChakraLink href={post.link} _hover={{ textDecoration: "none" }}>
          <FeaturedCard post={post} image={postImage} />
        </ChakraLink>
      ) : (
        <RouterLink to={post.link} style={{ textDecoration: "none" }}>
          <FeaturedCard post={post} image={postImage} />
        </RouterLink>
      )}
    </Box>
  );
};

// Helper components to reduce repetition
interface FeaturedCardProps {
  post: Post;
  image: string | undefined;
}

const FeaturedCard = ({ post, image }: FeaturedCardProps) => (
  <Stack
    gap={4}
    p={4}
    borderWidth="1px"
    borderRadius="xl"
    _hover={{ transform: "translateY(-4px)", shadow: "xl" }}
    transition="all 0.3s"
    h="100%"
  >
    <Image
      src={`/images/${image}`}
      alt={post.title}
      borderRadius="xl"
      objectFit="cover"
      width="100%"
      height="200px"
    />
    <Stack gap={2} flex="1">
      <Heading size="md" fontWeight="medium">
        {post.title}
      </Heading>
      <Text color="gray.focusRing" fontSize="sm" lineClamp={3}>
        {post.abstract}
      </Text>
      <HStack gap={2} pt={2}>
        <Tag.Root>
          <Tag.Label>{post.type}</Tag.Label>
        </Tag.Root>
        {post.video && (
          <Tag.Root>
            <Tag.Label>Video</Tag.Label>
          </Tag.Root>
        )}
        {post.date && (
          <Tag.Root>
            <Tag.Label>
              {post.date.month} {post.date.year}
            </Tag.Label>
          </Tag.Root>
        )}
      </HStack>
    </Stack>
  </Stack>
);

interface PostCardProps {
  post: Post;
}

const PostCard = ({ post }: PostCardProps) => (
  <Stack
    p={4}
    borderWidth="1px"
    borderRadius="xl"
    _hover={{ transform: "translateY(-4px)", shadow: "xl" }}
    transition="all 0.3s"
    gap={6}
    h="100%"
  >
    <Stack gap={2}>
      <Heading size="md" fontWeight="medium">
        {post.title}
      </Heading>
      <Text color="gray.focusRing" fontSize="sm" lineClamp={3}>
        {post.abstract}
      </Text>
      <HStack gap={2} pt={2}>
        <Tag.Root>
          <Tag.Label>{post.type}</Tag.Label>
        </Tag.Root>
        {post.video && (
          <Tag.Root>
            <Tag.Label>Video</Tag.Label>
          </Tag.Root>
        )}
        {post.date && (
          <Tag.Root>
            <Tag.Label>
              {post.date.month} {post.date.year}
            </Tag.Label>
          </Tag.Root>
        )}
      </HStack>
    </Stack>
  </Stack>
);
