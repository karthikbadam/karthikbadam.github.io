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
      <Container maxW="72ch" pb={4}>
        <VStack gap={4} align="stretch">
          <Heading color="accent">About Me</Heading>
          <Box>
            <Text fontSize="md" mb={4}>
              Full-stack engineer building tools for data exploration and ML
              training. Passionate about crafting intuitive interfaces that make
              sense of complex data.
            </Text>
            <Text fontSize="md" mb={4}>
              Get in touch:{" "}
              <Link href="mailto:karthikbadam7@gmail.com" color="accent">
                karthikbadam7 [at] gmail.com
              </Link>
            </Text>
          </Box>

          <Box>
            <Heading size="lg" mb={4} color="accentSubtle">
              Experience
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
              {experiences.map((exp, index) => (
                <Stack key={index} p={4} borderWidth="1px" borderRadius="lg">
                  <Heading size="md" color="accent">
                    {exp.title}
                  </Heading>
                  <Flex gap={2}>
                    <Text fontWeight="medium">{exp.company}</Text>
                    <Separator orientation="vertical" />
                    <Text color="gray.fg">{exp.period}</Text>
                  </Flex>
                  <Text mt={2} fontSize="sm">
                    {exp.description}
                  </Text>
                </Stack>
              ))}
            </SimpleGrid>
          </Box>
        </VStack>
      </Container>
    </Page>
  );
};
