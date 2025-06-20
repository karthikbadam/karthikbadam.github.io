import { Box, Text, Flex, Link } from "@chakra-ui/react";
import { ReactNode } from "react";
import { Navbar } from "./Navbar";

interface PageProps {
  children: ReactNode;
}

export const Page = ({ children }: PageProps) => {
  return (
    <Flex direction="column" height="100vh" width="100%">
      {/* Header */}
      <Box as="header" flex="none">
        <Navbar />
      </Box>

      {/* Main Content */}
      <Box py={2} as="main" flex="1" overflowY="auto">
        {children}
      </Box>

      {/* Footer */}
      <Box
        as="footer"
        py={4}
        px={{ base: 4, md: 10 }}
        borderTop="1px solid"
        borderColor="gray.subtle"
      >
        <Flex
          direction={{ base: "column", md: "row" }}
          justifyContent="space-between"
          alignItems="center"
          gap={2}
          color="gray.focusRing"
        >
          <Text fontSize="xs">
            © {new Date().getFullYear()} Karthik Badam. All rights reserved.
          </Text>

          <Flex gap={4} fontSize="xs">
            <Link
              href="mailto:karthikbadam7@gmail.com"
            >
              Email
            </Link>
            <Link
              href="https://linkedin.com/in/karthikbadam"
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn
            </Link>
            <Link
              href="https://github.com/karthikbadam"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </Link>
          </Flex>
        </Flex>
      </Box>
    </Flex>
  );
};
