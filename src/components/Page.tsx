import { ReactNode } from "react";
import { Box, Flex, Grid, Link, Text } from "@chakra-ui/react";
import { Navbar } from "./Navbar";

interface PageProps {
  children: ReactNode;
}

const Footer = () => (
  <Flex as="footer" justify="center" align="center" py={4} bg="gray.subtle">
    <Text fontSize="sm" color="gray.fg">
      © {new Date().getFullYear()} Karthik Badam.{' '}
      <Link href="mailto:karthik.badam@gmail.com" color="blue.fg">
        Contact
      </Link>
    </Text>
  </Flex>
);

export const Page = ({ children }: PageProps) => (
  <Grid templateRows="auto 1fr auto" h="100vh">
    <Navbar />
    <Box as="main" overflow="auto">{children}</Box>
    <Footer />
  </Grid>
);
