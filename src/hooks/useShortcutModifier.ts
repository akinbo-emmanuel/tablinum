"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

function getShortcutModifier(): "⌘" | "Ctrl" {
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘" : "Ctrl";
}

export function useShortcutModifier() {
  return useSyncExternalStore(subscribe, getShortcutModifier, () => "⌘");
}
