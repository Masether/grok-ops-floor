import type { AgentId, PipelineStage } from "./types.ts";

export type AgentShape =
  | "eyes"
  | "star"
  | "triangle"
  | "diamond"
  | "hex"
  | "shield"
  | "pulse"
  | "bolt"
  | "bars"
  | "coin"
  | "wave"
  | "feed";

export type AgentDef = {
  id: AgentId;
  name: string;
  role: string;
  color: string;
  colorDim: string;
  shape: AgentShape;
  orbit: number;
};

export const AGENTS: AgentDef[] = [
  {
    id: "scanner",
    name: "SCANNER",
    role: "Watches Kraken books and prints the brief",
    color: "#ff4d8d",
    colorDim: "rgba(255,77,141,0.18)",
    shape: "pulse",
    orbit: 0,
  },
  {
    id: "hunter",
    name: "HUNTER",
    role: "Ranks pairs and hunts the next ticket",
    color: "#ff6b4a",
    colorDim: "rgba(255,107,74,0.18)",
    shape: "bolt",
    orbit: 1,
  },
  {
    id: "dispatcher",
    name: "DISPATCHER",
    role: "Splits the brief and hands out the desk",
    color: "#c44dff",
    colorDim: "rgba(196,77,255,0.18)",
    shape: "hex",
    orbit: 2,
  },
  {
    id: "signal",
    name: "SIGNAL",
    role: "RSI, EMA cross, MACD — writes the call",
    color: "#3dffc8",
    colorDim: "rgba(61,255,200,0.18)",
    shape: "star",
    orbit: 3,
  },
  {
    id: "regime",
    name: "REGIME",
    role: "Trend or chop — blocks fading a dump",
    color: "#b38cff",
    colorDim: "rgba(179,140,255,0.18)",
    shape: "bars",
    orbit: 4,
  },
  {
    id: "flow",
    name: "FLOW",
    role: "Spread and volume — skips a dead book",
    color: "#5ce1ff",
    colorDim: "rgba(92,225,255,0.18)",
    shape: "wave",
    orbit: 5,
  },
  {
    id: "risk",
    name: "RISK",
    role: "Sizes the ticket and kills bad size",
    color: "#ffe14d",
    colorDim: "rgba(255,225,77,0.18)",
    shape: "triangle",
    orbit: 6,
  },
  {
    id: "treasury",
    name: "TREASURY",
    role: "Kraken cash, compound, never oversize the wallet",
    color: "#e8c547",
    colorDim: "rgba(232,197,71,0.18)",
    shape: "coin",
    orbit: 7,
  },
  {
    id: "sentinel",
    name: "SENTINEL",
    role: "Second read, drawdown halt, stale feed",
    color: "#4db8ff",
    colorDim: "rgba(77,184,255,0.18)",
    shape: "shield",
    orbit: 8,
  },
  {
    id: "runner",
    name: "RUNNER",
    role: "Hits Kraken or the paper blotter",
    color: "#ff8a3d",
    colorDim: "rgba(255,138,61,0.18)",
    shape: "eyes",
    orbit: 9,
  },
  {
    id: "archivist",
    name: "ARCHIVIST",
    role: "Journals every fill, reject, and halt",
    color: "#4dff7a",
    colorDim: "rgba(77,255,122,0.18)",
    shape: "diamond",
    orbit: 10,
  },
  {
    id: "wire",
    name: "WIRE",
    role: "News, names, and the catalysts that move the book",
    color: "#f0e6d2",
    colorDim: "rgba(240,230,210,0.18)",
    shape: "feed",
    orbit: 11,
  },
];

export const AGENT_BY_ID: Record<AgentId, AgentDef> = Object.fromEntries(
  AGENTS.map((a) => [a.id, a]),
) as Record<AgentId, AgentDef>;

export const PIPELINE: { id: PipelineStage; label: string }[] = [
  { id: "brief", label: "SETUP" },
  { id: "split", label: "CHALLENGE" },
  { id: "handout", label: "DATA" },
  { id: "tool", label: "RISK" },
  { id: "second", label: "MERGE" },
  { id: "signed", label: "SIGNED" },
];

export const STAGE_AGENT: Record<PipelineStage, AgentId> = {
  brief: "scanner",
  split: "hunter",
  handout: "signal",
  tool: "risk",
  second: "sentinel",
  signed: "runner",
};
