import { defineConfig } from "@chakra-ui/react";
import { textStyles } from "./components/ui/textStyles";

export const accent = {
  light: "#0c5c72",
  dark: "#DFD0B8",
};

export const accentSubtle = {
  light: "#0c5c72",
  dark: "#E8E0D0",
};

export const theme = defineConfig({
  theme: {
    textStyles,
    semanticTokens: {
      colors: {
        accent: {
          value: { _light: accent.light, _dark: accent.dark },
        },
        accentSubtle: {
          value: { _light: accentSubtle.light, _dark: accentSubtle.dark },
        },
      },
    },
  },
});
