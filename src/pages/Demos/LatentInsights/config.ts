// Centralized configuration and constants for Latent Insights demo

export const API_BASE = import.meta.env.DEV
  ? "http://localhost:8000/api"
  : "https://latent-insights-service-production.up.railway.app/api";

export const GITHUB_REPO_URL =
  "https://github.com/karthikbadam/latent-insights-service";

// --- ID preview lengths ---

export const THREAD_ID_PREVIEW_LENGTH = 6;
export const SESSION_ID_PREVIEW_LENGTH = 12;

// --- FlowViz layout constants ---

export const STEP_H = 20;
export const STEP_GAP = 4;
export const EVENT_H = 10;
export const EVENT_GAP = 3;
export const EVENT_WIDTH_RATIO = 0.6;
export const THREAD_GAP = 12;
export const TOP_PAD = 8;
export const MARKER_H = 20;

export const MOVE_ABBR: Record<string, string> = {
  SCOPE: "SC",
  FORAGE: "FO",
  FRAME: "FR",
  INTERROGATE: "IN",
  SYNTHESIZE: "SY",
  ERROR: "ER",
  UNKNOWN: "??",
};

// --- EventFeed colors and labels ---

// Muted, distinct thread colors (subtle but identifiable)
export const THREAD_SHADES_DARK = [
  "#7aa2f7", // blue
  "#9ece6a", // green
  "#e0af68", // amber
  "#bb9af7", // purple
  "#f7768e", // pink
  "#7dcfff", // cyan
  "#e0875f", // orange
  "#9cd6a4", // mint
  "#c4a7e7", // lavender
  "#f0c674", // yellow
  "#6ec3c9", // teal
  "#d6a0d1", // mauve
  "#a1c181", // olive
  "#eab0a0", // salmon
  "#8abeb7", // sea
  "#b5bd68", // lime
];

export const THREAD_SHADES_LIGHT = [
  "#3d5a99", "#548048", "#a47630", "#6b3e9e",
  "#c84a60", "#2d89a5", "#a85832", "#4a8055",
  "#7b4f9e", "#a87b2e", "#367b80", "#8d5a8a",
  "#628044", "#a8624d", "#4a7c78", "#6f7a3a",
];

// Move type colors — matched between dark/light
export const MOVE_COLORS_DARK: Record<string, { fg: string; bg: string }> = {
  SCOPE:       { fg: "#bb9af7", bg: "rgba(187, 154, 247, 0.12)" },
  FORAGE:      { fg: "#7aa2f7", bg: "rgba(122, 162, 247, 0.12)" },
  FRAME:       { fg: "#7dcfff", bg: "rgba(125, 207, 255, 0.12)" },
  INTERROGATE: { fg: "#e0af68", bg: "rgba(224, 175, 104, 0.12)" },
  SYNTHESIZE:  { fg: "#9ece6a", bg: "rgba(158, 206, 106, 0.12)" },
  ERROR:       { fg: "#f7768e", bg: "rgba(247, 118, 142, 0.12)" },
  UNKNOWN:     { fg: "#888",    bg: "rgba(136, 136, 136, 0.10)" },
};

export const MOVE_COLORS_LIGHT: Record<string, { fg: string; bg: string }> = {
  SCOPE:       { fg: "#6b3e9e", bg: "rgba(107, 62, 158, 0.10)" },
  FORAGE:      { fg: "#3d5a99", bg: "rgba(61, 90, 153, 0.10)" },
  FRAME:       { fg: "#2d89a5", bg: "rgba(45, 137, 165, 0.10)" },
  INTERROGATE: { fg: "#a47630", bg: "rgba(164, 118, 48, 0.10)" },
  SYNTHESIZE:  { fg: "#548048", bg: "rgba(84, 128, 72, 0.10)" },
  ERROR:       { fg: "#c84a60", bg: "rgba(200, 74, 96, 0.10)" },
  UNKNOWN:     { fg: "#888",    bg: "rgba(136, 136, 136, 0.10)" },
};

// Status dot colors
export const STATUS_COLORS: Record<string, string> = {
  running:  "#7aa2f7",
  waiting:  "#e0af68",
  complete: "#9ece6a",
  error:    "#f7768e",
};

export const TYPE_LABELS: Record<string, string> = {
  thread_start: "start",
  step_start: "step",
  llm_call: "llm",
  tool_call: "sql",
  step_complete: "done",
  thread_complete: "finished",
  thread_waiting: "waiting for input",
};

export const SCROLL_BOTTOM_THRESHOLD = 40;

// --- CommandBar mode config ---

import type { CommandMode, ExplorationPattern, QuestionSource } from "./types";

export const MODE_CONFIG: Record<
  CommandMode,
  { label: string; placeholder: string; description: string }
> = {
  ask: {
    label: "Ask",
    placeholder: "Ask a new question to start a thread…",
    description: "Creates a new analysis thread",
  },
  broadcast: {
    label: "Broadcast",
    placeholder: "Send a message to all active threads…",
    description: "Message all threads at once",
  },
  direct: {
    label: "Direct",
    placeholder: "Send direction to selected thread…",
    description: "Message a specific thread",
  },
  pattern: {
    label: "Pattern",
    placeholder: "Select a pattern below…",
    description: "Switch exploration pattern",
  },
  continue: {
    label: "Continue",
    placeholder: "Press Enter to resume stuck threads…",
    description: "Resume waiting/stuck threads",
  },
};

export const PATTERN_OPTIONS: { value: ExplorationPattern; label: string; description: string }[] = [
  { value: "coordinator_worker", label: "Coordinator-Worker", description: "Standard sequential analysis" },
  { value: "fan_out", label: "Fan Out", description: "Parallel exploration branches" },
  { value: "human_in_the_loop", label: "Human in the Loop", description: "Interactive guided analysis" },
];

export const SOURCE_OPTIONS: { value: QuestionSource; label: string }[] = [
  { value: "scout", label: "Auto (scout)" },
  { value: "human", label: "Manual" },
  { value: "both", label: "Both" },
];

// --- Featured sessions ---

export const FEATURED_SESSIONS = [
  {
    id: "846f0bbfefc0",
    dataset: "cars.csv",
    description: "10 threads · 60 steps",
  },
  {
    id: "a59dfbbd0fee",
    dataset: "exoplanets-nasa.csv",
    description: "8 threads · 4 waiting",
  },
  {
    id: "746fa2380425",
    dataset: "star_classification.csv",
    description: "8 threads · 3 waiting",
  },
] as const;
