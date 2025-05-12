import { Container, Heading, VStack, Text, Box, SimpleGrid } from '@chakra-ui/react'

const About = () => {
  const experiences = [
    {
      title: "Full Stack Engineer",
      company: "Apple",
      period: "2019 - Present",
      description: "Creating custom analytical tools for exploration, collaboration, and explanation when dealing with big data."
    },
    {
      title: "PhD in Computer Science",
      company: "University of Maryland",
      period: "2014 - 2019",
      description: "Research focused on interactive data visualization and human-computer interaction."
    }
  ]

  return (
    <Container maxW="container.xl" py={8}>
      <VStack gap={8} align="stretch">
        <Heading>About Me</Heading>
        
        <Box>
          <Text fontSize="lg" mb={4}>
            I am a researcher turned engineer with a strong interest in interactive web tooling. 
            My work focuses on creating tools that help people better understand and work with data 
            through intuitive and powerful interfaces.
          </Text>
        </Box>

        <Box>
          <Heading size="lg" mb={4}>Experience</Heading>
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={6}>
            {experiences.map((exp, index) => (
              <Box key={index} p={4} borderWidth="1px" borderRadius="lg">
                <Heading size="md">{exp.title}</Heading>
                <Text fontWeight="bold" mt={2}>{exp.company}</Text>
                <Text color="gray.fg">{exp.period}</Text>
                <Text mt={4}>{exp.description}</Text>
              </Box>
            ))}
          </SimpleGrid>
        </Box>
      </VStack>
    </Container>
  )
}

export default About 