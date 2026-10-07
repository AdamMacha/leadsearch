"use client";

import { useCallback, useRef, useState } from "react";
import type { Lead } from "@/lib/types";

export type QueueState = Record<string, "queued" | "running" | "done" | "error">;

/** Analyzes leads via the API with limited concurrency (PageSpeed is slow). */
export function useAnalyzeQueue(onDone?: (lead: Lead) => void, concurrency = 2) {
  const [state, setState] = useState<QueueState>({});
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);

  const run = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      cancelled.current = false;
      setRunning(true);
      setState((s) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, "queued" as const])) }));
      const queue = [...ids];
      const worker = async () => {
        while (queue.length && !cancelled.current) {
          const id = queue.shift()!;
          setState((s) => ({ ...s, [id]: "running" }));
          try {
            const res = await fetch(`/api/leads/${id}/analyze`, { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setState((s) => ({ ...s, [id]: "done" }));
            onDone?.(data.lead as Lead);
          } catch {
            setState((s) => ({ ...s, [id]: "error" }));
          }
        }
      };
      await Promise.all(Array.from({ length: concurrency }, worker));
      setRunning(false);
    },
    [concurrency, onDone],
  );

  const cancel = () => {
    cancelled.current = true;
  };
  const values = Object.values(state);
  const progress = {
    total: values.length,
    done: values.filter((v) => v === "done" || v === "error").length,
  };
  return { state, running, run, cancel, progress };
}
