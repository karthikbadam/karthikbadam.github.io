import {
  Container,
  Heading,
  VStack,
  Text,
  Box,
  SimpleGrid,
  Link,
} from "@chakra-ui/react";

export const About = () => {
  const experiences = [
    {
      title: "Staff Full Stack Engineer",
      company: "Apple",
      period: "2019 - Present",
      description:
        "Creating interactive tools for data that feeds in Apple Intelligence model training.",
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
    <Container maxW="72ch" py={8}>
      <VStack gap={8} align="stretch">
        <Heading>About Me</Heading>

        <Box>
          <Text fontSize="lg" mb={4}>
            Full-stack engineer building tools for data exploration and ML
            training. Passionate about crafting intuitive interfaces to make
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
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={6}>
            {experiences.map((exp, index) => (
              <Box key={index} p={4} borderWidth="1px" borderRadius="lg">
                <Heading size="md">{exp.title}</Heading>
                <Text fontWeight="bold" mt={2}>
                  {exp.company}
                </Text>
                <Text color="gray.fg">{exp.period}</Text>
                <Text mt={4}>{exp.description}</Text>
              </Box>
            ))}
          </SimpleGrid>
        </Box>
      </VStack>
    </Container>
  );
};
