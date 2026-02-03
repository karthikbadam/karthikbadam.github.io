
/**
 * Selection highlight styles for tokens and layers
 */
export const selectionStyles = {
  selected: {
    bg: "blue.subtle",
    borderColor: "accent",
    fontWeight: "semibold" as const,
  },
  unselected: {
    bg: "transparent",
    color: "fg",
  },
};

/**
 * Section title style for detail panels
 */
export const sectionTitleStyle = {
  fontSize: "xs" as const,
  fontWeight: "semibold" as const,
  color: "accentSubtle",
  mb: 2,
};
