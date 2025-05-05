import {
  Box,
  Container,
  Flex,
  Heading,
  Link,
  NativeSelect,
  Tag,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FormEvent, useState } from "react";
import publicationsData from "../data/publications.json";

const Publications = () => {
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");

  // Get unique types and years for filters
  const types = [
    "all",
    ...Array.from(new Set(publicationsData.map((pub) => pub.type))),
  ];
  const years = [
    "all",
    ...Array.from(new Set(publicationsData.map((pub) => pub.year))),
  ].sort((a, b) => b.localeCompare(a));

  // Filter publications based on selected type and year
  const filteredPublications = publicationsData.filter((pub) => {
    const typeMatch = selectedType === "all" || pub.type === selectedType;
    const yearMatch = selectedYear === "all" || pub.year === selectedYear;
    return typeMatch && yearMatch;
  });

  // Group publications by type
  const groupedPublications = filteredPublications.reduce((acc, pub) => {
    const type = pub.type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(pub);
    return acc;
  }, {} as Record<string, typeof publicationsData>);

  const handleTypeChange = (e: FormEvent<HTMLSelectElement>) => {
    setSelectedType(e.currentTarget.value);
  };

  const handleYearChange = (e: FormEvent<HTMLSelectElement>) => {
    setSelectedYear(e.currentTarget.value);
  };

  return (
    <Container maxW="container.xl" py={8}>
      <VStack gap={8} align="stretch">
        <Heading>Publications</Heading>

        {/* Filters */}
        <Flex gap={4} wrap="wrap">
          <NativeSelect.Root flex="1">
            <NativeSelect.Field
              value={selectedType}
              onChange={handleTypeChange}
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          <NativeSelect.Root flex="1">
            <NativeSelect.Field
              value={selectedYear}
              onChange={handleYearChange}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year === "all" ? "All Years" : year}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Flex>

        {/* Publications List by Type */}
        {Object.entries(groupedPublications).map(([type, pubs]) => (
          <Box key={type}>
            <Heading size="lg" mb={4}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Heading>
            {pubs.map((pub, index) => (
              <Box
                key={index}
                p={6}
                borderWidth="1px"
                borderRadius="lg"
                borderColor="gray.muted"
                _hover={{ shadow: "md" }}
                mb={2}
              >
                <VStack align="stretch" gap={2}>
                  <Flex justify="space-between" align="center">
                    <a
                      href={pub.pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <Heading size="md">{pub.title}</Heading>
                    </a>
                    <Text fontWeight="semibold">
                      {pub.year}
                    </Text>
                  </Flex>

                  <Text>{pub.authors.join(", ")}</Text>

                  <Flex gap={2} wrap="wrap">
                    {pub.award && (
                      <Text fontSize="sm" color="#6B46C1">
                        {pub.award}
                      </Text>
                    )}
                  </Flex>
                  <Text color="green.focusRing">{pub.venue}</Text>
                  <Flex gap={4}>
                    {pub.pdf && (
                      <Link
                        href={pub.pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        px={4}
                        py={2}
                        borderRadius="md"
                        borderWidth="1px"
                        borderColor="blue.subtle"
                        color="blue.fg"
                        _hover={{
                          bg: "blue.subtle",
                        }}
                      >
                        PDF
                      </Link>
                    )}
                    {pub.video && (
                      <Link
                        href={pub.video}
                        target="_blank"
                        rel="noopener noreferrer"
                        px={4}
                        py={2}
                        borderRadius="md"
                        borderWidth="1px"
                        borderColor="red.subtle"
                        color="red.fg"
                        _hover={{
                          bg: "red.muted",
                        }}
                      >
                        Video
                      </Link>
                    )}
                    {pub.bibtex && (
                      <Link
                        href={pub.bibtex}
                        target="_blank"
                        rel="noopener noreferrer"
                        px={4}
                        py={2}
                        borderRadius="md"
                        borderWidth="1px"
                        borderColor="gray.subtle"
                        color="gray.fg"
                        _hover={{
                          bg: "gray.muted",
                        }}
                      >
                        BibTeX
                      </Link>
                    )}
                  </Flex>

                  {pub.keywords && pub.keywords.length > 0 && (
                    <Flex gap={2} wrap="wrap">
                      {pub.keywords.map((keyword, idx) => (
                        <Tag.Root key={idx} fontSize="sm">
                          <Tag.Label>{keyword}</Tag.Label>
                        </Tag.Root>
                      ))}
                    </Flex>
                  )}
                </VStack>
              </Box>
            ))}
          </Box>
        ))}
      </VStack>
    </Container>
  );
};

export default Publications;
