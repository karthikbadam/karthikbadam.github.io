"use client";

import {
  ChakraProvider,
  createSystem,
  defaultConfig,
} from "@chakra-ui/react";
import { ColorModeProvider } from "./color-mode-provider";
import type { ColorModeProviderProps } from "./color-mode";
import { theme } from "../../theme";

const system = createSystem(defaultConfig, theme);

export function Provider(props: ColorModeProviderProps) {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider {...props} />
    </ChakraProvider>
  );
}
