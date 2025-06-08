import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Link,
  NativeSelect,
  Separator,
  Stack,
  Tag,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FormEvent, useState } from "react";
import { Page } from "../components/Page";
import publicationsData from "../data/publications.json";

export const Publications = () => {
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

  // Helper function to highlight author name
  const renderAuthors = (authors: string[]) => {
    return authors.map((author, idx) => (
      <span key={idx}>
        {author === "Sriram Karthik Badam" ? (
          <Text as="span" color="accent" fontWeight="medium">
            {author}
          </Text>
        ) : (
          author
        )}
        {idx < authors.length - 1 && ", "}
      </span>
    ));
  };

  return (
    <Page>
      <Container maxW="100ch" pb={4}>
        <VStack gap={4} align="stretch">
          <Heading color="accent">Publications</Heading>

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
            <Box key={type} fontSize="sm">
              <Heading size="md" mb={2} color="accentSubtle">
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Heading>
              {pubs.map((pub, index) => (
                <Box
                  key={index}
                  p={4}
                  borderWidth="1px"
                  borderRadius="lg"
                  borderColor="gray.muted"
                  mb={2}
                >
                  <Flex justify="space-between" gap={4}>
                    <Stack gap={2}>
                      <Heading size="md" color="accent">
                        {pub.title}
                      </Heading>
                      <Flex>
                        <Text>{renderAuthors(pub.authors)}</Text>
                      </Flex>
                      <Flex gap={2} wrap="wrap">
                        <Text>{pub.venue}</Text>
                        {pub.award && (
                          <>
                            <Separator orientation="vertical" />
                            <Text color="purple.fg">
                              {pub.award}
                            </Text>
                          </>
                        )}
                        <>
                          <Separator orientation="vertical" />
                          <Text>{pub.year}</Text>
                        </>
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
                    </Stack>
                    <Stack>
                      {pub.pdf && (
                        <Link
                          href={pub.pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button
                            size="sm"
                            minW="70px"
                            variant="outline"
                            color="accent"
                            borderColor="accent"
                            _hover={{
                              bg: "accentSubtle",
                              color: "gray.contrast",
                            }}
                          >
                            PDF
                          </Button>
                        </Link>
                      )}
                      {pub.video && (
                        <Link
                          href={pub.video}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            minW="70px"
                            color="accent"
                            borderColor="accent"
                            _hover={{
                              bg: "accentSubtle",
                              color: "gray.contrast",
                            }}
                          >
                            Video
                          </Button>
                        </Link>
                      )}
                    </Stack>
                  </Flex>
                </Box>
              ))}
            </Box>
          ))}
        </VStack>
      </Container>
    </Page>
  );
};
