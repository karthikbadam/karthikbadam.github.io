import { Grid, GridProps, Box, BoxProps } from "@chakra-ui/react";
import { ReactNode, Children } from "react";

interface TwoPanelWithScrollProps extends Omit<GridProps, "children"> {
  /** Width of left panel at md breakpoint and above */
  leftWidth?: string | number;
  /** Width of right panel at md breakpoint and above */
  rightWidth?: string | number;
  children: ReactNode;
}

interface PanelProps extends BoxProps {
  children: ReactNode;
}

const LeftPanel = ({ children, ...rest }: PanelProps) => (
  <Box
    position={{ base: "static", md: "sticky" }}
    top={{ base: "auto", md: 0 }}
    height={{ base: "auto", md: "fit-content" }}
    alignSelf={{ base: "stretch", md: "start" }}
    {...rest}
  >
    {children}
  </Box>
);

const RightPanel = ({ children, ...rest }: PanelProps) => <Box {...rest}>{children}</Box>;

const TwoPanelWithScrollComponent = ({
  children,
  leftWidth = "320px",
  rightWidth = "1fr",
  gap = 6,
  ...rest
}: TwoPanelWithScrollProps) => {
  const [left, right] = Children.toArray(children);
  return (
    <Grid
      templateColumns={{ base: "1fr", md: `${leftWidth} ${rightWidth}` }}
      gap={gap}
      minHeight={{ base: "auto", md: "calc(100vh - 100px)" }}
      mx="auto"
      w="fit-content"
      {...rest}
    >
      {left}
      {right}
    </Grid>
  );
};

export const TwoPanelWithScroll = Object.assign(TwoPanelWithScrollComponent, {
  LeftPanel,
  RightPanel,
});
