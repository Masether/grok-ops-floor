import type { AgentId } from "./types";

export type FloorPulse = {
  from: AgentId;
  to: AgentId;
  color?: string;
};

type Handler = (pulse: FloorPulse) => void;

const handlers = new Set<Handler>();

export function emitPulse(pulse: FloorPulse) {
  handlers.forEach((h) => h(pulse));
}

export function onPulse(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
