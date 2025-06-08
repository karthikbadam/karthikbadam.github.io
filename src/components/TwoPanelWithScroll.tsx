import { Box, Grid } from "@chakra-ui/react";
import { ReactNode, FC } from "react";

/**
 * Compound layout component with a sticky left panel and scrollable right panel
 * on larger screens. On small screens both panels scroll naturally.
 */
interface PanelProps {
  children: ReactNode;
}

interface TwoPanelWithScrollCompound extends FC<PanelProps> {
  LeftPanel: FC<PanelProps>;
  RightPanel: FC<PanelProps>;
}

export const TwoPanelWithScroll: TwoPanelWithScrollCompound = ({ children }) => (
  <Grid
    templateColumns={{ base: "1fr", md: "300px 1fr" }}
    gap={{ base: 8, md: "100px" }}
    minHeight={{ base: "auto", md: "calc(100vh - 100px)" }}
    mx="auto"
    w="fit-content"
  >
    {children}
  </Grid>
);

TwoPanelWithScroll.LeftPanel = function LeftPanel({ children }: PanelProps) {
  return (
    <Box
      position={{ base: "static", md: "sticky" }}
      top={{ base: "auto", md: 0 }}
      height={{ base: "auto", md: "fit-content" }}
      alignSelf={{ base: "stretch", md: "start" }}
    >
      {children}
    </Box>
  );
};

TwoPanelWithScroll.RightPanel = function RightPanel({ children }: PanelProps) {
  return (
    <Box overflowY="auto" maxH={{ base: "auto", md: "calc(100vh - 100px)" }}>
      {children}
    </Box>
  );
};
