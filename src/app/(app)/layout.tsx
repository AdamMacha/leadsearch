import { cookies } from "next/headers";
import { Sidebar } from "@/components/Sidebar";
import { AI_MODEL_COOKIE, DEFAULT_AI_MODEL } from "@/lib/ai/models";
import { repo } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let hot = 0;
  let favorites = 0;
  try {
    const stats = await repo().stats();
    hot = stats.hot;
    favorites = stats.favorites ?? 0;
  } catch {
    /* DB not configured – pages show their own error */
  }
  const cookieJar = await cookies();
  const activeModel = cookieJar.get(AI_MODEL_COOKIE)?.value || process.env.GEMINI_MODEL || DEFAULT_AI_MODEL;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar hot={hot} favorites={favorites} activeModel={activeModel} />
      <main style={{ flex: 1, minWidth: 0, paddingBottom: 70 }}>{children}</main>
    </div>
  );
}
