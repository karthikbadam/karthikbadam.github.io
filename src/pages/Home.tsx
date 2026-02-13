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

  // Create a more realistic gradient with better color stops
  const gradientStartColor = useColorModeValue(
    "#E8F1F8", // subtle blue tint at center
    "#4A433B", // lighter brown at center for depth
  );
  const gradientMidColor = useColorModeValue(
    "#F5F8FB", // intermediate light blue
    "#3A332B", // base dark brown
  );
  const gradientEndColor = useColorModeValue(
    "#FFFFFF", // pure white at edges for seamless blend
    "rgba(0, 0, 0, 0.4)", // darker shadow at edges
  );
  const borderColor = useColorModeValue("gray.100", "accentBackground");

  const featuredPosts = (featuredData as Post[]).filter(
    (post) => post.featured,
  );
  const restPosts = (featuredData as Post[]).filter((post) => !post.featured);

  return (
    <Page>
      <Container maxW="container.xl">
        <TwoPanelWithScroll
          leftWidth="320px"
          rightWidth="1fr"
          gap={{ base: 10, md: "120px" }}
        >
          <TwoPanelWithScroll.LeftPanel gap={6}>
            <Stack position="relative" mt={10} mb={6}>
              <Box
                position="relative"
                borderRadius="full"
                width="200px"
                overflow="hidden"
                boxShadow="lg"
                border="1px solid"
                borderColor={borderColor}
                css={{
                  background: `radial-gradient(ellipse 80% 100% at 50% 40%, 
                    ${gradientStartColor} 0%,
                    ${gradientStartColor} 30%,
                    ${gradientMidColor} 60%,
                    ${gradientEndColor} 100%)`,
                }}
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
                fontWeight="medium"
                size="3xl"
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
                evaluation, and ML training data augmentation at{" "}
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
            <Stack gap={4} maxW={{ base: "100%", lg: "76ch" }}>
              <Heading color="accent">Featured Explorations</Heading>
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
      <Text fontSize="sm" lineClamp={3} color="gray.focusRing">
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
      <Text color="gray.focusRing" fontSize="sm" lineClamp={2}>
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
