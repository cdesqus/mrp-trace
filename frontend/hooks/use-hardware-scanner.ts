"use client";

import { useEffect, useRef } from "react";

export function useHardwareScanner(onScan: (value: string) => void, enabled = true) {
  const buffer = useRef("");
  const lastKey = useRef(0);
  const callback = useRef(onScan);
  callback.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input,textarea,select,[contenteditable=true]")) return;
      const now = Date.now();
      if (now - lastKey.current > 80) buffer.current = "";
      lastKey.current = now;
      if (event.key === "Enter") {
        const value = buffer.current.trim();
        buffer.current = "";
        if (value) callback.current(value);
      } else if (event.key.length === 1) {
        buffer.current += event.key;
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [enabled]);
}
