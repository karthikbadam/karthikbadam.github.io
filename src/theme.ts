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

// Observable 10 chart palette — used by the trajectory-atlas charts (icicle
// fills, sankey ribbons, step-path dots) and any future viz that wants
// consistent categorical colours. Each tone has light + dark variants tuned
// for the site's surfaces.
export const chartPalette = {
  blue:      { light: "#4269D0", dark: "#7B9BE8" },
  orange:    { light: "#EFB118", dark: "#F5C44D" },
  red:       { light: "#FF725C", dark: "#FF9580" },
  cyan:      { light: "#6CC5B0", dark: "#8FD8C5" },
  green:     { light: "#3CA951", dark: "#6BC97D" },
  pink:      { light: "#FF8AB7", dark: "#FFA8C8" },
  purple:    { light: "#A463F2", dark: "#BC8AF5" },
  lightBlue: { light: "#97BBF5", dark: "#B5CFFB" },
  brown:     { light: "#9C6B4E", dark: "#B58A72" },
  gray:      { light: "#9498A0", dark: "#B8BCC4" },
  // Dedicated outcome scale, kept distinct from the tool categories above.
  outcomeSuccess: { light: "#0E7C42", dark: "#37C77D" },
  outcomePartial: { light: "#C77A0A", dark: "#E8A22E" },
  outcomeFail:    { light: "#C0231C", dark: "#EE5B4E" },
} as const;

const chartTokens = Object.fromEntries(
  Object.entries(chartPalette).map(([k, v]) => [
    k,
    { value: { _light: v.light, _dark: v.dark } },
  ]),
);

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
        chart: chartTokens,
      },
    },
  },
});
