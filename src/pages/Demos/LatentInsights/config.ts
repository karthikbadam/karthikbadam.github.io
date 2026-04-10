// Centralized configuration and constants for Latent Insights demo

import type { CommandMode, ExplorationPattern, QuestionSource } from "./types";

// --- API ---

export const API_BASE = import.meta.env.DEV
  ? "http://localhost:8000/api"
  : "https://latent-insights-service-production.up.railway.app/api";

export const GITHUB_REPO_URL =
  "https://github.com/karthikbadam/latent-insights-service";

// --- ID preview lengths ---

export const THREAD_ID_PREVIEW_LENGTH = 6;
export const SESSION_ID_PREVIEW_LENGTH = 12;

// --- FlowViz layout ---

export const STEP_H = 22;
export const STEP_GAP = 4;
export const EVENT_H = 10;
export const EVENT_GAP = 3;
export const EVENT_WIDTH_RATIO = 0.65;
export const THREAD_GAP = 20;
export const TOP_PAD = 8;
export const MARKER_H = 22;
export const START_MARKER_H = 40; // holds "START" label + thread id on two lines
export const SCROLL_BOTTOM_THRESHOLD = 40;

// --- Thread palette (muted, neutral) ---
// Clearly distinct from vivid move colors so threads don't compete visually.

export const THREAD_SHADES_DARK = [
  "#8b9bb0", "#a5b894", "#b8a682", "#a692b0",
  "#b09285", "#82a8b0", "#b8a28a", "#95a58b",
  "#a8959e", "#9faa85", "#8ba5a8", "#b097a8",
  "#9da890", "#b0957a", "#8a95a5", "#a895a8",
];

export const THREAD_SHADES_LIGHT = [
  "#55687d", "#6b8056", "#846e4a", "#6f5a75",
  "#7a5e52", "#4e7580", "#826e54", "#5c6e52",
  "#755d63", "#6f794e", "#567073", "#7a6478",
  "#66755a", "#7a6045", "#5a6573", "#735e72",
];

// --- Move colors ---
// fg = text color, bg = fill color. Contrast is tuned for both modes:
// dark mode = dark saturated bg + light tinted text
// light mode = pastel bg + dark saturated text

export interface MoveColor { fg: string; bg: string; }

export const MOVE_COLORS_DARK: Record<string, MoveColor> = {
  SCOPE:       { fg: "#d4bcff", bg: "#2e2340" },
  FORAGE:      { fg: "#a8c4ff", bg: "#20304d" },
  FRAME:       { fg: "#a3dff7", bg: "#1a3644" },
  INTERROGATE: { fg: "#ecc585", bg: "#3a2d1a" },
  SYNTHESIZE:  { fg: "#b6de8a", bg: "#1f3520" },
  ERROR:       { fg: "#f6909c", bg: "#3d1e26" },
  UNKNOWN:     { fg: "#aaaaaa", bg: "#3a3a3a" },
};

export const MOVE_COLORS_LIGHT: Record<string, MoveColor> = {
  SCOPE:       { fg: "#3e1c66", bg: "#e8dcf5" },
  FORAGE:      { fg: "#1e3566", bg: "#d7e2f5" },
  FRAME:       { fg: "#0d4a68", bg: "#cce8f2" },
  INTERROGATE: { fg: "#5e3d12", bg: "#f2e4c7" },
  SYNTHESIZE:  { fg: "#254820", bg: "#d8ecce" },
  ERROR:       { fg: "#74212f", bg: "#f5d2d8" },
  UNKNOWN:     { fg: "#444444", bg: "#e0e0e0" },
};

// Neutral gray fill for running/waiting/unknown state
export const NEUTRAL_FILL_DARK = { fg: "#bbbbbb", bg: "#3a3a3a" };
export const NEUTRAL_FILL_LIGHT = { fg: "#555555", bg: "#d8d8d8" };

// --- CommandBar mode config ---

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
  { id: "846f0bbfefc0", dataset: "cars.csv",              description: "10 threads · 60 steps" },
  { id: "a59dfbbd0fee", dataset: "exoplanets-nasa.csv",   description: "8 threads · 4 waiting" },
  { id: "746fa2380425", dataset: "star_classification.csv", description: "8 threads · 3 waiting" },
] as const;
