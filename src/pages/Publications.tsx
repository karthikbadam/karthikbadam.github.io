import {
  Box,
  Container,
  Flex,
  Heading,
  Link,
  NativeSelect,
  Separator,
  Tag,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FormEvent, useState } from "react";
import { Page } from "../components/Page";
import { useColorModeValue } from "../components/ui/color-mode";
import { accent, accentSubtle } from "../theme";
import publicationsData from "../data/publications.json";

export const Publications = () => {
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");

  const highlightColor = useColorModeValue(accent.light, accent.dark);
  const subtleHeadingColor = useColorModeValue(accentSubtle.light, accentSubtle.dark);
  const buttonColor = useColorModeValue(accentSubtle.light, accentSubtle.dark);
  const buttonHoverBg = useColorModeValue(accent.light, accent.dark);

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
          <Text as="span" color={highlightColor} fontWeight="semibold">
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
          <Heading color={subtleHeadingColor}>Publications</Heading>

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
            <Box key={type} fontSize='sm'>
              <Heading size="md" mb={2} color={subtleHeadingColor}>
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
                        <Heading size="md" color={buttonColor}>{pub.title}</Heading>
                      </a>
                      <Text fontWeight="semibold">{pub.year}</Text>
                    </Flex>
                    <Text>{renderAuthors(pub.authors)}</Text>
                   
                    <Flex gap={2} wrap="wrap">
                      <Text color={highlightColor} fontWeight="semibold">{pub.venue}</Text>
                      {pub.award && (
                        <>
                          <Separator orientation="vertical" />
                          <Text color="purple.fg">{pub.award}</Text>
                        </>
                      )}
                    </Flex>

                    <Flex gap={2}>
                      {pub.pdf && (
                        <Link
                          href={pub.pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          px={2}
                          py={1}
                          borderRadius="md"
                          borderWidth="1px"
                          borderColor={buttonColor}
                          color={buttonColor}
                          _hover={{ bg: buttonHoverBg, color: "white" }}
                        >
                          PDF
                        </Link>
                      )}
                      {pub.video && (
                        <Link
                          href={pub.video}
                          target="_blank"
                          rel="noopener noreferrer"
                          px={2}
                          py={1}
                          borderRadius="md"
                          borderWidth="1px"
                          borderColor={buttonColor}
                          color={buttonColor}
                          _hover={{ bg: buttonHoverBg, color: "white" }}
                        >
                          Video
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
    </Page>
  );
};
