"use client";

import { useState, useTransition } from "react";
import { setAiModelAction, testAiModelAction } from "@/app/actions";
import { IconCheck, IconExternal, IconSparkle, IconZap } from "@/components/icons";
import { AI_MODELS, DEFAULT_AI_MODEL } from "@/lib/ai/models";

export function AiModelSettings({ initialModel }: { initialModel: string }) {
  const [selected, setSelected] = useState(initialModel || DEFAULT_AI_MODEL);
  const [customModel, setCustomModel] = useState(
    AI_MODELS.some((m) => m.id === initialModel) ? "" : initialModel,
  );
  const [isCustom, setIsCustom] = useState(
    Boolean(initialModel && !AI_MODELS.some((m) => m.id === initialModel)),
  );

  const [saving, startSave] = useTransition();
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [testing, startTest] = useTransition();
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  const currentActive = isCustom ? customModel.trim() : selected;

  const handleSave = () => {
    if (!currentActive) return;
    setSaveError(null);
    setSaveSuccess(false);
    startSave(async () => {
      try {
        await setAiModelAction(currentActive);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } catch (err) {
        setSaveError((err as Error).message);
      }
    });
  };

  const handleTest = () => {
    if (!currentActive) return;
    setTestResult(null);
    startTest(async () => {
      const res = await testAiModelAction(currentActive);
      setTestResult(res);
    });
  };

  return (
    <section className="card" style={{ gridColumn: "1 / -1" }}>
      <div className="card-title">
        <div className="row" style={{ gap: 8 }}>
          <IconSparkle size={18} style={{ color: "var(--accent)" }} />
          <h3>Aktivní AI model (Gemini)</h3>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="badge badge-accent">Aktivní: {currentActive || "není zvolen"}</span>
          <a
            href="https://aistudio.google.com/"
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm btn-ghost"
            title="Otevřít přehled limitů v Google AI Studio"
          >
            Google AI Studio <IconExternal size={12} />
          </a>
        </div>
      </div>

      <p className="text-2 small" style={{ marginBottom: 16 }}>
        Každý model v Google AI Studio má <strong>vlastní samostatnou bezplatnou kvótu</strong> (RPM / RPD).
        Pokud narazíš na limit dotazů (např. <code>429 Quota exceeded</code>), stačí zde nebo přímo v detailu firmy přepnout na jiný model – aplikace navíc v případě překročení limitu automaticky vyzkouší záložní model, takže se tvá práce nezasekne.
      </p>

      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {AI_MODELS.map((m) => {
          const isSelected = !isCustom && selected === m.id;
          return (
            <div
              key={m.id}
              onClick={() => {
                setIsCustom(false);
                setSelected(m.id);
                setTestResult(null);
              }}
              style={{
                border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                backgroundColor: isSelected ? "rgba(99, 102, 241, 0.08)" : "var(--card-subtle)",
                borderRadius: "var(--radius)",
                padding: "14px",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                  <strong style={{ fontSize: "0.95rem" }}>{m.name}</strong>
                  {m.badge && (
                    <span className={`badge ${m.recommended ? "badge-good" : ""}`}>
                      {m.badge}
                    </span>
                  )}
                </div>
                <p className="small muted" style={{ margin: "4px 0 8px 0" }}>
                  {m.description}
                </p>
              </div>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <span className="small text-2 mono" style={{ fontSize: "0.78rem" }}>
                  {m.limits}
                </span>
                {isSelected && (
                  <span className="badge badge-accent row" style={{ gap: 4 }}>
                    <IconCheck size={11} /> Zvoleno
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Custom model card */}
        <div
          onClick={() => {
            setIsCustom(true);
            setTestResult(null);
          }}
          style={{
            border: isCustom ? "2px solid var(--accent)" : "1px solid var(--border)",
            backgroundColor: isCustom ? "rgba(99, 102, 241, 0.08)" : "var(--card-subtle)",
            borderRadius: "var(--radius)",
            padding: "14px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
              <strong style={{ fontSize: "0.95rem" }}>Vlastní model</strong>
              <span className="badge">Custom</span>
            </div>
            <p className="small muted" style={{ margin: "4px 0 8px 0" }}>
              Zadej libovolné ID modelu z Google AI Studia (např. <code>gemini-3.6-flash</code>).
            </p>
          </div>
          <div>
            <input
              type="text"
              className="input input-sm"
              placeholder="např. gemini-3.5-flash"
              value={customModel}
              onChange={(e) => {
                setIsCustom(true);
                setCustomModel(e.target.value);
              }}
              style={{ width: "100%" }}
            />
          </div>
        </div>
      </div>

      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          className="btn btn-primary"
          disabled={saving || !currentActive}
          onClick={handleSave}
        >
          {saving ? <span className="spinner" /> : <IconCheck size={15} />}
          Uložit jako výchozí
        </button>

        <button
          className="btn btn-secondary"
          disabled={testing || !currentActive}
          onClick={handleTest}
        >
          {testing ? <span className="spinner" /> : <IconZap size={15} />}
          Otestovat dostupnost a limit
        </button>

        {saveSuccess && (
          <span className="row text-2 small" style={{ color: "var(--good)", gap: 4 }}>
            <IconCheck size={14} /> Výchozí model byl úspěšně uložen!
          </span>
        )}
        {saveError && <span className="small alert-bad">{saveError}</span>}
      </div>

      {testResult && (
        <div
          className={`alert ${testResult.ok ? "alert-info" : "alert-bad"}`}
          style={{ marginTop: 14 }}
        >
          {testResult.ok ? (
            <div className="row" style={{ gap: 8 }}>
              <IconCheck size={15} style={{ color: "var(--good)" }} />
              <span>
                Model <strong>{currentActive}</strong> je dostupný a plně funkční (odezva: {testResult.latencyMs} ms).
              </span>
            </div>
          ) : (
            <div>
              <strong>Chyba při testu modelu {currentActive}:</strong> {testResult.error}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
