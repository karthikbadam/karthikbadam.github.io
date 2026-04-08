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

export const STEP_H = 16;
export const STEP_GAP = 2;
export const EVENT_H = 8;
export const EVENT_GAP = 2;
export const EVENT_WIDTH_RATIO = 0.55;
export const THREAD_GAP = 16;
export const TOP_PAD = 4;
export const MARKER_H = 16;

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

export const THREAD_SHADES_DARK = [
  "#888", "#999", "#777", "#aaa", "#666",
  "#8a8a8a", "#7a7a7a", "#9a9a9a", "#6a6a6a", "#b0b0b0",
];

export const THREAD_SHADES_LIGHT = [
  "#666", "#555", "#777", "#444", "#888",
  "#5a5a5a", "#6a6a6a", "#4a4a4a", "#7a7a7a", "#3a3a3a",
];

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
    placeholder: "Ask a new question to start a thread\u2026",
    description: "Creates a new analysis thread",
  },
  broadcast: {
    label: "Broadcast",
    placeholder: "Send a message to all active threads\u2026",
    description: "Message all threads at once",
  },
  direct: {
    label: "Direct",
    placeholder: "Send direction to selected thread\u2026",
    description: "Message a specific thread",
  },
  pattern: {
    label: "Pattern",
    placeholder: "Select a pattern below\u2026",
    description: "Switch exploration pattern",
  },
  continue: {
    label: "Continue",
    placeholder: "Press Enter to resume stuck threads\u2026",
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
    description: "10 threads \u00b7 60 steps",
  },
  {
    id: "a59dfbbd0fee",
    dataset: "exoplanets-nasa.csv",
    description: "8 threads \u00b7 4 waiting",
  },
  {
    id: "746fa2380425",
    dataset: "star_classification.csv",
    description: "8 threads \u00b7 3 waiting",
  },
] as const;
