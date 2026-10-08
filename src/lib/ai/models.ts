export interface AiModelInfo {
  id: string;
  name: string;
  badge?: string;
  description: string;
  limits: string;
  recommended?: boolean;
}

export const AI_MODELS: AiModelInfo[] = [
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash Lite",
    badge: "Doporučeno",
    description: "Blesková rychlost a nejvyšší bezplatné limity (30 RPM). Ideální při intenzivnějším testování.",
    limits: "30 RPM · nejvyšší kvóta",
    recommended: true,
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    badge: "Stabilní",
    description: "Vyvážený model, detailní a přesná analýza webů i copywriting oslovení.",
    limits: "15 RPM · standardní kvóta",
  },
  {
    id: "gemini-flash-lite-latest",
    name: "Gemini Flash Lite (Latest)",
    badge: "Auto-update",
    description: "Vždy nejnovější odlehčená verze z rodiny Flash Lite s vysokou dostupností.",
    limits: "Vysoká kvóta",
  },
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    badge: "Preview",
    description: "Experimentální náhled nejnovější verze. Má přísnější kvóty v Google AI Studio.",
    limits: "Přísnější kvóta (snadno vyčerpatelná)",
  },
];

export const DEFAULT_AI_MODEL = "gemini-3.5-flash-lite";
export const AI_MODEL_COOKIE = "leadradar_ai_model";

export function getModelInfo(modelId?: string): AiModelInfo | undefined {
  if (!modelId) return undefined;
  return AI_MODELS.find((m) => m.id === modelId);
}

export function formatModelLabel(modelId?: string): string {
  if (!modelId) return DEFAULT_AI_MODEL;
  const found = getModelInfo(modelId);
  return found ? found.name : modelId;
}
