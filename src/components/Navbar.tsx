import {
  Box,
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerPositioner,
  DrawerRoot,
  DrawerTitle,
  DrawerTrigger,
  Flex,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useState } from "react";
import { LuMenu, LuX } from "react-icons/lu";
import { Link, useLocation } from "react-router-dom";
import { ColorModeButton } from "./ui/color-mode-button";
import { useColorModeValue } from "./ui/color-mode";
import { accent } from "../theme";

const NAV_ITEMS = [
  { to: "/explorations", label: "Explorations" },
  { to: "/publications", label: "Publications" },
  { to: "/about", label: "About" },
] as const;

export const Navbar = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeLinkColor = useColorModeValue(accent.light, accent.dark);
  const inactiveLinkColor = useColorModeValue("gray.600", "gray.400");

  const getLinkStyle = (path: string) => ({
    textDecoration: "none",
    color: location.pathname === path ? activeLinkColor : inactiveLinkColor,
    fontWeight: location.pathname === path ? "600" : "normal",
    borderBottom:
      location.pathname === path ? `2px solid ${activeLinkColor}` : "none",
    paddingBottom: "2px",
  });

  const closeMobile = () => setMobileOpen(false);

  return (
    <Box px={{ base: 4, md: 8 }} py={2} fontSize="sm">
      <Flex h={8} alignItems="center" justifyContent="space-between">
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
          <Flex
            as="nav"
            gap={{ base: 4, md: 8 }}
            alignItems="center"
            display={{ base: "none", md: "flex" }}
          >
            {NAV_ITEMS.map(({ to, label }) => (
              <Link key={to} to={to} style={getLinkStyle(to)}>
                {label}
              </Link>
            ))}
          </Flex>

          <Box display={{ base: "block", md: "none" }}>
            <DrawerRoot
              open={mobileOpen}
              onOpenChange={(e) => setMobileOpen(e.open)}
              placement="end"
              size="xs"
            >
              <DrawerTrigger asChild>
                <IconButton aria-label="Open menu" variant="ghost" size="sm">
                  <LuMenu />
                </IconButton>
              </DrawerTrigger>
              <DrawerBackdrop />
              <DrawerPositioner>
                <DrawerContent>
                  <DrawerHeader>
                    <DrawerTitle>Menu</DrawerTitle>
                    <DrawerCloseTrigger asChild>
                      <IconButton
                        aria-label="Close menu"
                        variant="ghost"
                        size="sm"
                        position="absolute"
                        top={4}
                        insetEnd={2}
                      >
                        <LuX size={18} />
                      </IconButton>
                    </DrawerCloseTrigger>
                  </DrawerHeader>
                  <DrawerBody pt={2}>
                    <VStack align="stretch" gap={1}>
                      {NAV_ITEMS.map(({ to, label }) => (
                        <Link
                          key={to}
                          to={to}
                          onClick={closeMobile}
                          style={{
                            ...getLinkStyle(to),
                            borderBottom: "none",
                            paddingTop: "10px",
                            paddingBottom: "10px",
                            borderRadius: "8px",
                          }}
                        >
                          <Text
                            fontWeight={
                              location.pathname === to ? "600" : "normal"
                            }
                            color={
                              location.pathname === to
                                ? activeLinkColor
                                : inactiveLinkColor
                            }
                          >
                            {label}
                          </Text>
                        </Link>
                      ))}
                    </VStack>
                  </DrawerBody>
                </DrawerContent>
              </DrawerPositioner>
            </DrawerRoot>
          </Box>

          <ColorModeButton />
        </Flex>
      </Flex>
    </Box>
  );
};
