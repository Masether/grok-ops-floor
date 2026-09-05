/** UI clicks load the engine on demand so the desk can paint without it. */

export function haltLive() {
  return import("./engine.ts").then((m) => m.haltLive());
}

export function scanLiveTape() {
  return import("./engine.ts").then((m) => m.scanLiveTape());
}

export function studyBook() {
  return import("./engine.ts").then((m) => m.studyBook());
}

export function refreshTreasury() {
  return import("./engine.ts").then((m) => m.refreshTreasury());
}

export function executeOrder(...args: Parameters<typeof import("./engine.ts").executeOrder>) {
  return import("./engine.ts").then((m) => m.executeOrder(...args));
}

export function placeManualTicket(...args: Parameters<typeof import("./engine.ts").placeManualTicket>) {
  return import("./engine.ts").then((m) => m.placeManualTicket(...args));
}

export function closeLot(...args: Parameters<typeof import("./engine.ts").closeLot>) {
  return import("./engine.ts").then((m) => m.closeLot(...args));
}

export function cancelPendingTicket() {
  return import("./engine.ts").then((m) => m.cancelPendingTicket());
}
