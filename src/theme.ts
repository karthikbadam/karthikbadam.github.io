import { defineConfig } from "@chakra-ui/react";
import { textStyles } from "./components/ui/textStyles";

export const accent = {
  light: "#2b6cb0",
  dark: "#DFD0B8",
};

export const accentSubtle = {
  light: "#2b6cb0",
  dark: "#E8E0D0",
};

export const accentBackground = {
  light: "#F0F5F9", // subtle blue-grey that blends with gradient
  dark: "#3A332B", // darker for better contrast with person in image
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
        accentBackground: {
          value: {
            _light: accentBackground.light,
            _dark: accentBackground.dark,
          },
        },
      },
    },
  },
});
