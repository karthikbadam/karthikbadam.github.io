// Centralized style tokens for the Mosaic chart components.
//
// SVG <text> needs styles via the React `style` attribute (the SVG
// `font-size` attribute is unreliable across renderers — see the Sankey
// label-blow-up bug). All chart text + tooltip styling routes through
// this module so font sizes / colours line up across icicle, sankey, and
// any future visualisations and so changes happen in one place.

import type { CSSProperties } from "react";

/** Chart text — label rendered on a node rectangle (icicle cell, sankey node). */
export const chartLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
};

/** Secondary text — counts, percentages rendered alongside labels. */
export const chartValueStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 400,
  opacity: 0.65,
};

/** Sankey column header — uppercase muted label above each column. */
export const chartColumnHeaderStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

/** Foreground colour for SVG text on light/dark surfaces. */
export function chartFg(dark: boolean): string {
  return dark ? "#f7fafc" : "#1a202c";
}

/** Inverse foreground (text against an accent fill, e.g. dark icicle level). */
export function chartFgInverse(dark: boolean): string {
  return dark ? "#1a202c" : "#ffffff";
}

/** Muted text colour, e.g. column headers. */
export function chartFgMuted(dark: boolean): string {
  return dark ? "#a0aec0" : "#718096";
}

/** Tooltip container styling. Position fields are passed by the caller. */
export function tooltipContainerStyle(
  dark: boolean,
  width: number = 260,
): CSSProperties {
  return {
    position: "absolute",
    background: dark ? "#1a202c" : "#ffffff",
    color: chartFg(dark),
    border: `1px solid ${dark ? "#2d3748" : "#e2e8f0"}`,
    borderRadius: 6,
    boxShadow: "0 4px 12px rgba(0,0,0,.18)",
    padding: "8px 10px",
    fontSize: 12,
    pointerEvents: "none",
    width,
    maxWidth: width,
    zIndex: 5,
    lineHeight: 1.5,
    whiteSpace: "normal",
    wordBreak: "break-all",
  };
}

export const tooltipTitleStyle: CSSProperties = {
  fontWeight: 600,
  marginBottom: 4,
};

export function tooltipRowStyle(dark: boolean): CSSProperties {
  return {
    display: "flex",
    justifyContent: "space-between",
    color: dark ? "#cbd5e0" : "#4a5568",
  };
}

/** A subtle path/footer line in the tooltip — used for full path strings. */
export function tooltipMetaStyle(dark: boolean): CSSProperties {
  return {
    marginTop: 6,
    fontSize: 11,
    color: chartFgMuted(dark),
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  };
}
