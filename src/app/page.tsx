// src/app/page.tsx
import Link from "next/link";
import { DOMAINS } from "@/domains/registry";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background:
          "radial-gradient(circle at 20% 10%, rgba(167,139,250,0.18), transparent 45%)," +
          "radial-gradient(circle at 85% 25%, rgba(96,165,250,0.14), transparent 40%)," +
          "radial-gradient(circle at 50% 80%, rgba(244,114,182,0.10), transparent 48%)," +
          "radial-gradient(circle at 20% 10%, #0b1020, #050814 55%, #02040f)",
        color: "#E5E7EB",
        fontFamily: "ui-sans-serif",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>Knowledge Graph Explorer</div>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
          ドメインを選ぶと、そのナレッジグラフを探索できます（今後追加してもOKな構造）
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
            marginTop: 18,
          }}
        >
          {Object.values(DOMAINS).map((d) => (
            <Link
              key={d.key}
              href={`/g/${d.key}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                borderRadius: 18,
                padding: 16,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                backdropFilter: "blur(10px)",
              }}
            >
              <div style={{ fontSize: 13, opacity: 0.9 }}>{d.badge}</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950, lineHeight: 1.25 }}>
                {d.label}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85, lineHeight: 1.7 }}>
                {d.description}
              </div>

              <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
                例：{d.example}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
