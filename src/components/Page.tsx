import { Box, Text, Flex, Link, Grid } from "@chakra-ui/react";
import { ReactNode } from "react";
import { Navbar } from "./Navbar";

interface PageProps {
  children: ReactNode;
}

export const Page = ({ children }: PageProps) => {
  return (
    <Grid templateRows="auto 1fr auto" height="100vh" width="100%">
      {/* Header */}
      <Box as="header">
        <Navbar />
      </Box>

      {/* Main Content */}
      <Box as="main" overflow="auto" height="100%">
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
              href="mailto:karthik_badam@gmail.com"
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
    </Grid>
  );
};
