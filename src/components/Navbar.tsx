import { Box, Flex } from "@chakra-ui/react";
import { Link } from "react-router-dom";
import { ColorModeButton } from "./ui/color-mode-button";

export const Navbar = () => {
  return (
    <Box bg="gray.subtle" px={10} shadow="sm">
      <Flex h={16} alignItems="center" justifyContent="space-between">
        <Link 
          to="/" 
          style={{ 
            textDecoration: "none", 
            fontWeight: "bold", 
            fontSize: "large" 
          }}
        >
          Home
        </Link>
        <Flex gap={8} alignItems='center'>
          <Link 
            to="/publications" 
            style={{ textDecoration: "none" }}
          >
            Publications
          </Link>

          <Link 
            to="/posts" 
            style={{ textDecoration: "none" }}
          >
            Posts
          </Link>
          <Link 
            to="/about" 
            style={{ textDecoration: "none" }}
          >
            About
          </Link>
          <ColorModeButton />
        </Flex>
      </Flex>
    </Box>
  );
};
