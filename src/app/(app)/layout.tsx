import { Sidebar } from "@/components/Sidebar";
import { repo } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let hot = 0;
  try {
    hot = (await repo().stats()).hot;
  } catch {
    /* DB not configured – pages show their own error */
  }
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar hot={hot} />
      <main style={{ flex: 1, minWidth: 0, paddingBottom: 70 }}>{children}</main>
    </div>
  );
}
