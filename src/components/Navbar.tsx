import { Box, Flex } from "@chakra-ui/react";
import { Link, useLocation } from "react-router-dom";
import { ColorModeButton } from "./ui/color-mode-button";
import { useColorModeValue } from "./ui/color-mode";

export const Navbar = () => {
  const location = useLocation();
  const activeLinkColor = useColorModeValue("#6e5d44", "#DFD0B8");
  const inactiveLinkColor = useColorModeValue("gray.600", "gray.400");

  const getLinkStyle = (path: string) => ({
    textDecoration: "none",
    color: location.pathname === path ? activeLinkColor : inactiveLinkColor,
    fontWeight: location.pathname === path ? "600" : "normal",
    borderBottom:
      location.pathname === path ? `2px solid ${activeLinkColor}` : "none",
    paddingBottom: "2px",
  });

  return (
    <Box px={{ base: 4, md: 10 }} py={2} fontSize="sm">
      <Flex h={10} alignItems="center" justifyContent="space-between">
        <Link
          to="/"
          style={{
            textDecoration: "none",
            fontWeight: "600",
            fontSize: "medium",
            color:
              location.pathname === "/" ? activeLinkColor : inactiveLinkColor,
          }}
        >
          Home
        </Link>
        <Flex gap={{ base: 4, md: 8 }} alignItems="center">
          <Link to="/publications" style={getLinkStyle("/publications")}>
            Publications
          </Link>

          <Link to="/posts" style={getLinkStyle("/posts")}>
            Posts
          </Link>

          <Link to="/about" style={getLinkStyle("/about")}>
            About
          </Link>
          <ColorModeButton />
        </Flex>
      </Flex>
    </Box>
  );
};
