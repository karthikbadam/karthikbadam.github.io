import {
  Container,
  Heading,
  VStack,
  Text,
  Box,
  SimpleGrid,
  Link,
  Stack,
  Separator,
  Flex,
} from "@chakra-ui/react";
import { Page } from "../components/Page";

export const About = () => {
  const experiences = [
    {
      title: "Staff Full Stack Engineer",
      company: "Apple",
      period: "2019 - Present",
      description:
        "Creating interactive ML tools to augment datasets that feed Apple Intelligence model training.",
    },
    {
      title: "Ph.D. in Computer Science",
      company: "University of Maryland",
      period: "2014 - 2019",
      description:
        "Research focused on interactive data visualization and human-computer interaction.",
    },
  ];

  return (
    <Page>
      <Container maxW="72ch" py={8}>
        <VStack gap={4} align="stretch">
          <Heading>About Me</Heading>
          <Box>
            <Text fontSize="lg" mb={4}>
              Full-stack engineer building tools for data exploration and ML
              training. Passionate about crafting intuitive interfaces that make
              sense of complex data.
            </Text>
            <Text fontSize="lg" mb={4}>
              Get in touch:{" "}
              <Link href="mailto:karthikbadam7@gmail.com" color="blue.500">
                karthikbadam7@gmail.com
              </Link>
            </Text>
          </Box>

          <Box>
            <Heading size="lg" mb={4}>
              Experience
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
              {experiences.map((exp, index) => (
                <Stack key={index} p={4} borderWidth="1px" borderRadius="lg">
                  <Heading size="md">{exp.title}</Heading>
                  <Flex gap={2}>
                    <Text fontWeight="medium">{exp.company}</Text>
                    <Separator orientation="vertical" />
                    <Text color="gray.fg">{exp.period}</Text>
                  </Flex>
                  <Text mt={2}>{exp.description}</Text>
                </Stack>
              ))}
            </SimpleGrid>
          </Box>
        </VStack>
      </Container>
    </Page>
  );
};
