import {
  Box,
  Button,
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
import type { ComponentProps, ReactNode } from "react";
import { LuGithub, LuLinkedin, LuMail } from "react-icons/lu";
import { Link as RouterLink } from "react-router-dom";
import { Page } from "../components/Page";
import { TwoPanelWithScroll } from "../components/TwoPanelWithScroll";
import { useColorModeValue } from "../components/ui/color-mode";
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
  tags?: string[];
}

const SOCIAL_ICON_SIZE = 14;

function SocialExpandLink({
  href,
  label,
  children,
  ...rest
}: {
  href: string;
  label: string;
  children: ReactNode;
} & Omit<ComponentProps<typeof Link>, "href" | "children">) {
  return (
    <Link
      href={href}
      display="inline-flex"
      alignItems="center"
      flexShrink={0}
      borderRadius="full"
      bg="accentBackground"
      color="accent"
      maxW={6}
      h={6}
      overflow="hidden"
      whiteSpace="nowrap"
      transition="max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s ease"
      _hover={{
        maxW: "9rem",
      }}
      {...rest}
    >
      <Box
        w={6}
        h={6}
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        {children}
      </Box>
      <Text as="span" fontSize="xs" fontWeight="medium" pr={2} lineHeight={1}>
        {label}
      </Text>
    </Link>
  );
}

export const Home = () => {
  const featuredPosts = (featuredData as Post[]).filter(
    (post) => post.featured === true,
  );

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
            <Stack gap={2} mt={4}>
              <Heading fontWeight="semibold" size="2xl" color="accent">
                Karthik Badam
              </Heading>
              <Text fontSize="sm" color="gray.fg" lineHeight="tall">
                <Text as="span" color="accent" fontWeight="semibold">
                  Full-stack engineer
                </Text>{" "}
                building visualization tools for metrics reporting, LLM
                evaluation, and ML training at{" "}
                <Text as="span" color="accent" fontWeight="semibold">
                  Apple.
                </Text>{" "}
                Ph.D. in Computer Science from the University of Maryland,
                College Park. Published novel research in HCI, Data
                Visualization, and ML.
              </Text>
              <HStack gap={2} pt={2} align="center">
                <SocialExpandLink
                  href="mailto:karthikbadam7@gmail.com"
                  label="Email"
                  aria-label="Email"
                >
                  <LuMail size={SOCIAL_ICON_SIZE} strokeWidth={2} />
                </SocialExpandLink>
                <SocialExpandLink
                  href="https://linkedin.com/in/karthikbadam"
                  label="LinkedIn"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn"
                >
                  <LuLinkedin size={SOCIAL_ICON_SIZE} strokeWidth={2} />
                </SocialExpandLink>
                <SocialExpandLink
                  href="https://github.com/karthikbadam"
                  label="GitHub"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub"
                >
                  <LuGithub size={SOCIAL_ICON_SIZE} strokeWidth={2} />
                </SocialExpandLink>
              </HStack>
            </Stack>
          </TwoPanelWithScroll.LeftPanel>
          <TwoPanelWithScroll.RightPanel py={4}>
            <Stack
              gap={2}
              maxW={{ base: "100%", lg: "80ch" }}
              mb={{ base: 10, md: 12 }}
            >
              <Heading color="accent" fontWeight="semibold" fontSize="xl">
                Featured Explorations
              </Heading>
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
              <RouterLink
                to="/explorations"
                style={{ alignSelf: "flex-start" }}
              >
                <Button
                  mt={2}
                  size="sm"
                  variant="outline"
                  color="accent"
                  borderColor="accent"
                  _hover={{ bg: "accentSubtle", color: "gray.contrast" }}
                >
                  See more
                </Button>
              </RouterLink>
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
    borderWidth="1.5px"
    borderColor="gray.muted"
    borderRadius="xl"
    _hover={{
      transform: "translateY(-4px)",
      shadow: "xl",
      shadowColor: "gray.muted",
    }}
    transition="all 0.3s"
    h="100%"
    overflow="hidden"
    p={4}
  >
    <Image
      src={`/images/${image}`}
      alt={post.title}
      objectFit="cover"
      width="100%"
      height="200px"
    />
    <Stack gap={2} flex="1">
      <Heading size="sm" fontWeight="medium" css={{ wordBreak: "break-word" }}>
        {post.title}
        {post.date && (
          <Text as="span" fontWeight="normal" color="fg.muted" fontSize="xs">
            {" "}
            • {post.date.month} {post.date.year}
          </Text>
        )}
      </Heading>
      <Text fontSize="xs" lineClamp={3} color="fg.muted">
        {post.abstract}
      </Text>
      {post.tags && post.tags.length > 0 && (
        <HStack gap={1.5} flexWrap="wrap" pt={1}>
          {post.tags.map((tag, i) => (
            <Tag.Root key={`${tag}-${i}`} size="sm" variant="subtle">
              <Tag.Label>{tag}</Tag.Label>
            </Tag.Root>
          ))}
        </HStack>
      )}
    </Stack>
  </Stack>
);
