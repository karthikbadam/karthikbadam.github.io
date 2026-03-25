import {
  Box,
  Link as ChakraLink,
  Container,
  Grid,
  Heading,
  HStack,
  Image,
  Link,
  Stack,
  Tag,
  Text,
} from "@chakra-ui/react";
import { Link as RouterLink } from "react-router-dom";
import { Page } from "../components/Page";
import { TwoPanelWithScroll } from "../components/TwoPanelWithScroll";
import { useColorModeValue } from "../components/ui/color-mode";
import featuredData from "../data/featured.json";
import { accent } from "../theme";

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
    (post) => post.featured,
  );
  const restPosts = (featuredData as Post[]).filter((post) => !post.featured);

  return (
    <Page>
      <Container maxW="container.xl">
        <TwoPanelWithScroll
          leftWidth="310px"
          rightWidth="1fr"
          gap={{ base: 10, md: "100px" }}
        >
          <TwoPanelWithScroll.LeftPanel gap={6}>
            <Stack position="relative" mt={{ base: 6, md: "60px" }} mb={4}>
              <Box
                position="relative"
                borderRadius="full"
                width="140px"
                overflow="hidden"
                border="1px solid"
                borderColor="gray.border"
                bgColor="accentBackground"
              >
                <Image
                  src="profile.png"
                  alt="Karthik Badam"
                  borderRadius="full"
                  width="100%"
                  height="100%"
                  objectFit="cover"
                  position="relative"
                  zIndex={1}
                  transition="transform 0.3s"
                  _hover={{ transform: "scale(1.05)" }}
                />
              </Box>
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
              <Text fontSize="sm" color="gray.fg" lineHeight="tall">
                I am a{" "}
                <Text as="span" color="accent" fontWeight="semibold">
                  full-stack engineer
                </Text>{" "}
                building visualization tools for metrics reporting, LLM
                evaluation, and ML training data curation at{" "}
                <Text as="span" color="accent" fontWeight="semibold">
                  Apple.
                </Text>{" "}
                I received a Ph.D. in Computer Science from the University of
                Maryland, College Park, where I published novel research in HCI
                and ML.
              </Text>
              <Text fontSize="sm">
                Get in touch:{" "}
                <Link
                  fontWeight="medium"
                  href="mailto:karthikbadam7@gmail.com"
                  color="accent"
                  variant="underline"
                >
                  karthikbadam7@gmail.com
                </Link>
              </Text>
            </Stack>
          </TwoPanelWithScroll.LeftPanel>
          <TwoPanelWithScroll.RightPanel py={2}>
            <Stack gap={2} maxW={{ base: "100%", lg: "80ch" }} pr={4}>
              <Heading color="accent" fontWeight="semibold">
                Explorations
              </Heading>
              {/* Featured Posts as Large Cards - Side by Side */}
              {featuredPosts.length > 0 && (
                <Grid
                  templateColumns={{
                    base: "1fr",
                    md: featuredPosts.length === 1 ? "1fr" : "1fr 1fr",
                  }}
                  gap={4}
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
                  gap={4}
                  mt={2}
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
          </TwoPanelWithScroll.RightPanel>
        </TwoPanelWithScroll>
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
    post.image && typeof post.image === "object" ? post.image.dark : undefined,
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
      <Heading size="sm" fontWeight="medium">
        {post.title}
      </Heading>
      <Text fontSize="sm" lineClamp={3} color="fg.muted">
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
      <Heading size="sm" fontWeight="medium">
        {post.title}
      </Heading>
      <Text color="fg.muted" fontSize="sm" lineClamp={2}>
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
