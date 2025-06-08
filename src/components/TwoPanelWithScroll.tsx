import { Box, Grid } from "@chakra-ui/react";
import { ReactNode } from "react";

interface TwoPanelWithScrollProps {
  left: ReactNode;
  right: ReactNode;
}

/**
 * Layout with a sticky left panel and scrollable right panel on larger screens.
 * On small screens both panels scroll naturally.
 */
export const TwoPanelWithScroll = ({ left, right }: TwoPanelWithScrollProps) => {
  return (
    <Grid
      templateColumns={{ base: "1fr", md: "300px 1fr" }}
      gap={{ base: 8, md: "100px" }}
      minHeight={{ base: "auto", md: "calc(100vh - 100px)" }}
      mx="auto"
      w="fit-content"
    >
      <Box
        position={{ base: "static", md: "sticky" }}
        top={{ base: "auto", md: 0 }}
        height={{ base: "auto", md: "fit-content" }}
        alignSelf={{ base: "stretch", md: "start" }}
      >
        {left}
      </Box>
      <Box
        overflowY="auto"
        maxH={{ base: "auto", md: "calc(100vh - 100px)" }}
      >
        {right}
      </Box>
    </Grid>
  );
};
