"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteLead } from "@/app/actions";
import { IconRefresh, IconTrash, IconZap } from "@/components/icons";

export function AnalyzeButton({ id, analyzed, auto }: { id: string; analyzed: boolean; auto?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${id}/analyze`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.replace(`/leads/${id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (auto && !started.current) {
      started.current = true;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <>
      {error && <span className="badge badge-bad" title={error}>Chyba analýzy</span>}
      <button className={`btn ${analyzed ? "" : "btn-primary"}`} onClick={run} disabled={loading} id="analyze-btn">
        {loading ? <span className="spinner" /> : analyzed ? <IconRefresh size={15} /> : <IconZap size={15} />}
        {loading ? "Analyzuji (až 40 s)…" : analyzed ? "Znovu analyzovat" : "Analyzovat web"}
      </button>
    </>
  );
}

export function DeleteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-ghost btn-danger"
      disabled={pending}
      id="delete-lead"
      title="Smazat lead"
      onClick={() => {
        if (confirm("Opravdu smazat tento lead?")) start(() => deleteLead(id));
      }}
    >
      <IconTrash size={15} />
    </button>
  );
}
