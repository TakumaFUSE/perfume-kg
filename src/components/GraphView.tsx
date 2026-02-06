// src/components/GraphView.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type { Core } from "cytoscape";
import type { DomainKey, DomainSpec, KindStyle } from "@/domains/registry";

type KGNodeData = { id: string; label: string; kind: string; depth: number; expanded?: boolean };
type KGEdgeData = { id: string; source: string; target: string; label: string };
type KGNodeEl = { data: KGNodeData };
type KGEdgeEl = { data: KGEdgeData };
type ExpandResponse = { nodes: KGNodeData[]; edges: KGEdgeData[] };

function computeRingPositions(cy: Core) {
  const center = { x: 0, y: 0 };
  const ringGap = 170;

  const byDepth = new Map<number, any[]>();
  cy.nodes().forEach((n) => {
    const d = Number(n.data("depth") ?? 0);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(n);
  });

  [...byDepth.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([depth, nodes]) => {
      if (depth === 0) {
        nodes.forEach((n) => n.position(center));
        return;
      }
      const radius = ringGap * depth;
      const count = nodes.length;

      nodes.sort((a, b) => String(a.id()).localeCompare(String(b.id())));

      nodes.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / Math.max(count, 1);
        n.position({
          x: center.x + radius * Math.cos(angle),
          y: center.y + radius * Math.sin(angle),
        });
      });
    });
}

/**
 * 2段目以降：押したノードの「進行方向（親→focus）」の先へ、子を扇状に配置する
 * - 親が取れない（root等）場合は右方向へ伸ばす
 */
function placeChildrenForward(cy: Core, focusId: string, childIds: string[]) {
  const focus = cy.getElementById(focusId);
  if (!focus || focus.empty()) return;

  const fp = focus.position();

  const inEdges = focus.incomers("edge");
  const parent = inEdges.length > 0 ? inEdges[0].source() : null;

  let dx = 1,
    dy = 0;
  if (parent && parent.length > 0) {
    const pp = parent.position();
    dx = fp.x - pp.x;
    dy = fp.y - pp.y;
  }
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  const px = -dy;
  const py = dx;

  const forwardDist = 200;
  const sideGap = 70;
  const stagger = 28;

  const ids = [...childIds].sort((a, b) => a.localeCompare(b));
  const mid = (ids.length - 1) / 2;

  const minSep = 62;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const child = cy.getElementById(id);
    if (!child || child.empty()) continue;

    const t = i - mid;
    const side = t * sideGap;
    const fd = forwardDist + Math.abs(t) * stagger;

    let x = fp.x + dx * fd + px * side;
    let y = fp.y + dy * fd + py * side;

    for (let k = 0; k < 8; k++) {
      let ok = true;
      cy.nodes().forEach((n) => {
        if (n.id() === id) return;
        const np = n.position();
        const d = Math.hypot(np.x - x, np.y - y);
        if (d < minSep) ok = false;
      });
      if (ok) break;
      x += dx * 40;
      y += dy * 40;
    }

    child.position({ x, y });
  }
}

function mergeUniqueElements(prev: (KGNodeEl | KGEdgeEl)[], incoming: (KGNodeEl | KGEdgeEl)[]) {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const el of prev) {
    if ("source" in el.data) edgeIds.add(el.data.id);
    else nodeIds.add(el.data.id);
  }

  const merged = [...prev];
  for (const el of incoming) {
    if ("source" in el.data) {
      if (edgeIds.has(el.data.id)) continue;
      edgeIds.add(el.data.id);
      merged.push(el);
    } else {
      if (nodeIds.has(el.data.id)) continue;
      nodeIds.add(el.data.id);
      merged.push(el);
    }
  }
  return merged;
}

function labelWithIcon(spec: DomainSpec, kind: string, label: string) {
  const icon = spec.kindIcons[kind] ?? "•";
  return `${icon} ${label}`;
}

function kindStylesToStylesheet(kindStyles?: Record<string, KindStyle>) {
  if (!kindStyles) return [];

  return Object.entries(kindStyles).map(([kind, style]) => {
    const cyStyle: Record<string, any> = {};

    if (style.shape) cyStyle["shape"] = style.shape;
    if (style.borderColor) cyStyle["border-color"] = style.borderColor;
    if (typeof style.width === "number") cyStyle["width"] = style.width;
    if (typeof style.height === "number") cyStyle["height"] = style.height;
    if (typeof style.fontSize === "number") cyStyle["font-size"] = style.fontSize;

    return {
      selector: `node[kind = "${kind}"]`,
      style: cyStyle,
    };
  });
}

export default function GraphView({ domain, spec }: { domain: DomainKey; spec: DomainSpec }) {
  const cyRef = useRef<Core | null>(null);

  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{ id: string; label: string; kind: string; depth: number } | null>(null);

  const [hasStarted, setHasStarted] = useState(false);
  const hasStartedRef = useRef(false);
  useEffect(() => {
    hasStartedRef.current = hasStarted;
  }, [hasStarted]);

  // fit/zoomの揺れを防ぐ：初期ズームを固定して、以降もfitしない
  const BASE_ZOOM = 0.95;
  const ZOOM_MAX = 1.18;

  const rootId = spec.root.id;

  const [elements, setElements] = useState<(KGNodeEl | KGEdgeEl)[]>([
    {
      data: {
        id: rootId,
        label: labelWithIcon(spec, spec.root.kind, spec.root.label),
        kind: spec.root.kind,
        depth: 0,
      },
    },
  ]);

  const layout = useMemo(() => ({ name: "preset", fit: false, padding: 40 }), []);

  const style = useMemo(() => {
    const base = [
      {
        selector: "node",
        style: {
          label: "data(label)",

          color: "#E5E7EB",
          "text-outline-width": 3,
          "text-outline-color": "#060816",
          "font-size": 12,
          "text-wrap": "wrap",
          "text-max-width": 150,

          "background-color": "#0B1020",
          "border-width": 2,
          "border-color": "#334155",

          "shadow-blur": 18,
          "shadow-opacity": 0.25,
          "shadow-offset-x": 0,
          "shadow-offset-y": 0,

          width: 44,
          height: 44,

          opacity: 0.95,
        },
      },

      // 深さによる差分（ドメイン共通）
      { selector: "node[kind = 'root']", style: { width: 50, height: 50, "font-size": 12, "shadow-opacity": 0.35 } },
      { selector: "node[depth = 1]", style: { width: 56, height: 56, "font-size": 13, "shadow-opacity": 0.32 } },
      { selector: "node[depth >= 2]", style: { width: 46, height: 46, "font-size": 11, "shadow-opacity": 0.22 } },

      { selector: "node:hover", style: { "border-width": 4, "shadow-opacity": 0.75 } },
      { selector: "node:selected", style: { "border-width": 4, "shadow-opacity": 0.85 } },

      {
        selector: "edge",
        style: {
          width: 1.4,
          "line-color": "#334155",
          "target-arrow-color": "#334155",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",

          label: "data(label)",
          color: "#CBD5E1",
          "font-size": 10,
          "text-opacity": 0.25,
          opacity: 0.55,

          "text-background-opacity": 0.9,
          "text-background-color": "#060816",
          "text-background-padding": 3,
          "text-background-shape": "round-rectangle",
        },
      },

      { selector: "edge.emph", style: { "text-opacity": 1, opacity: 1, width: 2.2 } },
      { selector: "node.emph", style: { "shadow-opacity": 0.9, "border-width": 5 } },
    ];

    // ★ここがB案：kindごとの見た目は spec.kindStyles から生成
    const dynamicKind = kindStylesToStylesheet(spec.kindStyles);

    // rootはregistry側で shape/borderColor などを指定できるが、
    // base側の node[kind='root'] のサイズ指定は残したいので併存させる
    return [...base, ...dynamicKind];
  }, [spec.kindStyles]);

  function clearEmphasis(cy: Core) {
    cy.nodes().removeClass("emph");
    cy.edges().removeClass("emph");
  }

  function emphasizeNeighborhood(cy: Core, nodeId: string) {
    clearEmphasis(cy);
    const n = cy.getElementById(nodeId);
    if (!n || n.empty()) return;

    n.addClass("emph");
    const edges = n.connectedEdges();
    edges.addClass("emph");
    edges.targets().addClass("emph");
  }

  async function expand(nodeId: string) {
    const cy = cyRef.current;
    if (!cy) return;
    if (loading) return;

    const node = cy.getElementById(nodeId);
    if (!node || node.empty()) return;
    if (node.data("expanded")) return;

    setLoading(true);
    try {
      const focusNode = {
        id: node.data("id") as string,
        label: node.data("label") as string,
        kind: node.data("kind") as string,
        depth: node.data("depth") as number,
      };

      const existingNodeIds = cy.nodes().map((n) => n.id());

      const res = await fetch(`/api/expand/${domain}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focusNode, existingNodeIds }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t);
      }

      const payload = (await res.json()) as ExpandResponse;

      const incoming: (KGNodeEl | KGEdgeEl)[] = [
        ...payload.nodes.map((n) => ({
          data: { ...n, label: labelWithIcon(spec, n.kind, n.label) },
        })),
        ...payload.edges.map((e) => ({ data: e })),
      ];

      setElements((prev) => mergeUniqueElements(prev, incoming));

      let added: any = null;
      try {
        added = cy.add(incoming as any);
      } catch {
        added = null;
      }

      node.data("expanded", true);

      const childIds = payload.nodes.map((n) => n.id);
      if (focusNode.id === rootId) {
        computeRingPositions(cy);
      } else {
        placeChildrenForward(cy, focusNode.id, childIds);
      }

      if (added) {
        added.style("opacity", 0);
        added.animate({ style: { opacity: 1 } }, { duration: 260 });
      }

      // fitは一切しない：center + zoomだけ
      cy.animate({ center: { eles: node }, duration: 260 });
      const nextZoom = Math.min(ZOOM_MAX, Math.max(BASE_ZOOM, cy.zoom() * 1.04));
      cy.animate({ zoom: nextZoom, duration: 260 });
    } finally {
      setLoading(false);
    }
  }

  async function start() {
    if (hasStartedRef.current) return;

    hasStartedRef.current = true;
    setHasStarted(true);

    setSelected({ id: rootId, label: spec.root.label, kind: spec.root.kind, depth: 0 });

    const cy = cyRef.current;
    if (cy) {
      const root = cy.getElementById(rootId);
      cy.zoom(BASE_ZOOM);
      cy.center(root);
    }

    await expand(rootId);
  }

  return (
    <main
      style={{
        height: "100vh",
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 20% 10%, rgba(167,139,250,0.18), transparent 45%)," +
          "radial-gradient(circle at 85% 25%, rgba(96,165,250,0.14), transparent 40%)," +
          "radial-gradient(circle at 50% 80%, rgba(244,114,182,0.10), transparent 48%)," +
          "radial-gradient(circle at 20% 10%, #0b1020, #050814 55%, #02040f)",
      }}
    >
      {/* 左上 */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 30,
          color: "#e5e7eb",
          fontFamily: "ui-sans-serif",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 0.2 }}>{spec.title}</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{spec.subtitle}</div>
        {loading && <div style={{ fontSize: 12, marginTop: 8, opacity: 0.9 }}>展開中…</div>}
      </div>

      {/* 右ペイン */}
      {selected && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 340,
            padding: 14,
            zIndex: 40,
            color: "#E5E7EB",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 16,
            backdropFilter: "blur(10px)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            fontFamily: "ui-sans-serif",
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {selected.kind} / depth {selected.depth}
          </div>
          <div style={{ fontSize: 18, fontWeight: 950, marginTop: 6, lineHeight: 1.2 }}>{selected.label}</div>
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 10, lineHeight: 1.65 }}>
            2段目以降は「押したノードの進行方向の先」に枝が伸びます。
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              onClick={() => expand(selected.id)}
              disabled={loading}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.10)",
                color: "#E5E7EB",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 850,
              }}
            >
              さらに展開
            </button>

            <button
              onClick={() => setSelected(null)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.05)",
                color: "#E5E7EB",
                cursor: "pointer",
                fontWeight: 850,
              }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 初回オーバーレイ */}
      {!hasStarted && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(0,0,0,0.40)",
            backdropFilter: "blur(6px)",
          }}
          onClick={start}
        >
          <div
            style={{
              width: "min(520px, 92vw)",
              borderRadius: 18,
              padding: 18,
              color: "#E5E7EB",
              fontFamily: "ui-sans-serif",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
            }}
          >
            <div style={{ fontSize: 14, opacity: 0.9 }}>{spec.badge}</div>
            <div style={{ fontSize: 22, fontWeight: 950, marginTop: 8, lineHeight: 1.25 }}>{spec.overlayHeadline}</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 10, lineHeight: 1.7 }}>{spec.overlayBody}</div>

            <button
              onClick={start}
              style={{
                marginTop: 14,
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.10)",
                color: "#E5E7EB",
                cursor: "pointer",
                fontWeight: 950,
                letterSpacing: 0.2,
              }}
            >
              はじめる（タップ）
            </button>

            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 10 }}>※どこをタップしても開始できます</div>
          </div>
        </div>
      )}

      <CytoscapeComponent
        elements={elements as any}
        style={{ width: "100%", height: "100%" }}
        stylesheet={style as any}
        layout={layout as any}
        cy={(cy) => {
          cyRef.current = cy;

          cy.getElementById(rootId)?.position({ x: 0, y: 0 });
          cy.zoom(BASE_ZOOM);
          cy.center(cy.getElementById(rootId));

          cy.off("tap");
          cy.off("tap", "node");

          cy.on("tap", "node", (evt) => {
            if (!hasStartedRef.current) return;

            const n = evt.target;
            const id = n.id();

            setSelected({
              id,
              label: n.data("label"),
              kind: n.data("kind"),
              depth: n.data("depth"),
            });

            emphasizeNeighborhood(cy, id);

            cy.animate({ center: { eles: n }, duration: 240 });
            const nextZoom = Math.min(ZOOM_MAX, Math.max(BASE_ZOOM, cy.zoom() * 1.03));
            cy.animate({ zoom: nextZoom, duration: 240 });

            expand(id);
          });

          cy.on("tap", (evt) => {
            if (evt.target === cy) clearEmphasis(cy);
          });
        }}
      />
    </main>
  );
}
