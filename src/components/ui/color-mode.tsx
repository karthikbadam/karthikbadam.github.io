/* eslint-disable @typescript-eslint/no-empty-object-type */
"use client";

import type { IconButtonProps } from "@chakra-ui/react";
import { useTheme } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

export interface ColorModeProviderProps extends ThemeProviderProps {}

export type ColorMode = "light" | "dark";

export interface UseColorModeReturn {
  colorMode: ColorMode;
  setColorMode: (colorMode: ColorMode) => void;
  toggleColorMode: () => void;
}

export function useColorMode(): UseColorModeReturn {
  const { resolvedTheme, setTheme } = useTheme();
  const toggleColorMode = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };
  return {
    colorMode: resolvedTheme as ColorMode,
    setColorMode: setTheme,
    toggleColorMode,
  };
}

export function useColorModeValue<T>(light: T, dark: T) {
  const { colorMode } = useColorMode();
  return colorMode === "dark" ? dark : light;
}

export interface ColorModeButtonProps
  extends Omit<IconButtonProps, "aria-label"> {}
