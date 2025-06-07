import { Box, Text, Flex, Link, Grid } from "@chakra-ui/react";
import { ReactNode } from "react";
import { Navbar } from "./Navbar";

interface PageProps {
  children: ReactNode;
}

export const Page = ({ children }: PageProps) => {
  return (
    <Grid
      templateRows="auto 1fr auto"
      minHeight="100vh"
      width="100%"
    >
      {/* Header */}
      <Box as="header">
        <Navbar />
      </Box>

      {/* Main Content */}
      <Box
        as="main"
        overflow="auto"
        flex="1"
      >
        {children}
      </Box>

      {/* Footer */}
      <Box
        as="footer"
        bg="gray.subtle"
        py={6}
        px={{ base: 4, md: 10 }}
        borderTop="1px"
        borderColor="gray.border"
      >
        <Flex
          direction={{ base: "column", md: "row" }}
          justifyContent="space-between"
          alignItems="center"
          gap={4}
        >
          <Text fontSize="sm" color="gray.fg">
            © {new Date().getFullYear()} Karthik Badam. All rights reserved.
          </Text>
          
          <Flex gap={4} fontSize="sm">
            <Link
              href="mailto:contact@karthikbadam.com"
              color="gray.fg"
              _hover={{ color: "gray.800", textDecoration: "underline" }}
            >
              Email
            </Link>
            <Link
              href="https://linkedin.com/in/karthikbadam"
              color="gray.fg"
              _hover={{ color: "gray.800", textDecoration: "underline" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn
            </Link>
            <Link
              href="https://github.com/karthikbadam"
              color="gray.fg"
              _hover={{ color: "gray.800", textDecoration: "underline" }}
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