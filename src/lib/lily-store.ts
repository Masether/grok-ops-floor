import { create } from "zustand";
import type { LilyBrief } from "./lilyrose.ts";

type LilyState = {
  lilyOpen: boolean;
  lilyBrief: LilyBrief | null;
  lilyBusy: boolean;
  setLilyOpen: (v: boolean) => void;
  setLilyBrief: (brief: LilyBrief | null) => void;
  setLilyBusy: (v: boolean) => void;
};

export const useLily = create<LilyState>((set) => ({
  lilyOpen: false,
  lilyBrief: null,
  lilyBusy: false,
  setLilyOpen: (v) => set({ lilyOpen: v }),
  setLilyBrief: (brief) => set({ lilyBrief: brief }),
  setLilyBusy: (v) => set({ lilyBusy: v }),
}));
