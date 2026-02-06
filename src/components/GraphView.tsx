// src/components/GraphView.tsx
"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type { Core } from "cytoscape";
import type { DomainKey, DomainSpec, KindStyle } from "@/domains/registry";

type KGNodeData = {
  id: string;
  label: string;
  kind: string;
  depth: number;
  expanded?: boolean;
  pending?: 1;
  pendingKey?: string;
};
type KGEdgeData = {
  id: string;
  source: string;
  target: string;
  label: string;
  pending?: 1;
  pendingKey?: string;
};
type KGNodeEl = { data: KGNodeData };
type KGEdgeEl = { data: KGEdgeData };

type ExpandResponse = {
  nodes: { id: string; label: string; kind: string; depth: number }[];
  edges: { id: string; source: string; target: string; label: string }[];
};

function labelWithIcon(spec: DomainSpec, kind: string, label: string) {
  const icon = spec.kindIcons?.[kind] ?? "";
  return icon ? `${icon}\n${label}` : label;
}

function mergeUniqueElements(prev: (KGNodeEl | KGEdgeEl)[], incoming: (KGNodeEl | KGEdgeEl)[]) {
  const seen = new Set(prev.map((e: any) => e?.data?.id));
  const merged = [...prev];

  for (const el of incoming as any[]) {
    const id = el?.data?.id;
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(el);
  }
  return merged;
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

    return { selector: `node[kind = "${kind}"]`, style: cyStyle };
  });
}

function computeRingPositions(cy: Core) {
  const root = cy.nodes("[kind = 'root']").first();
  if (!root || root.empty()) return;

  const rootPos = root.position();
  const depth1 = cy.nodes("[depth = 1]");
  const depth2 = cy.nodes("[depth >= 2]");

  const ring1 = 170;
  const ring2 = 320;

  const placeOnRing = (nodes: any, radius: number) => {
    const n = nodes.length;
    if (n === 0) return;
    nodes.forEach((node: any, i: number) => {
      const theta = (2 * Math.PI * i) / n;
      node.position({
        x: rootPos.x + radius * Math.cos(theta),
        y: rootPos.y + radius * Math.sin(theta),
      });
    });
  };

  placeOnRing(depth1, ring1);
  placeOnRing(depth2, ring2);
}

function placeChildrenForward(cy: Core, parentId: string, childIds: string[]) {
  const parent = cy.getElementById(parentId);
  if (!parent || parent.empty()) return;

  const p = parent.position();
  const inEdges = parent.incomers("edge");
  const from = inEdges.length ? inEdges.source().first() : null;

  let vx = 1;
  let vy = 0;
  if (from && !from.empty()) {
    const fp = from.position();
    vx = p.x - fp.x;
    vy = p.y - fp.y;
    const len = Math.hypot(vx, vy) || 1;
    vx /= len;
    vy /= len;
  }

  const step = 190;
  const spread = 120;

  childIds.forEach((cid, i) => {
    const child = cy.getElementById(cid);
    if (!child || child.empty()) return;

    const t = i - (childIds.length - 1) / 2;
    const px = -vy;
    const py = vx;

    child.position({
      x: p.x + vx * step + px * spread * t,
      y: p.y + vy * step + py * spread * t,
    });
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
      { selector: "node[kind = 'root']", style: { width: 50, height: 50, "font-size": 12, "shadow-opacity": 0.35 } },
      { selector: "node[depth = 1]", style: { width: 56, height: 56, "font-size": 13, "shadow-opacity": 0.32 } },
      { selector: "node[depth >= 2]", style: { width: 46, height: 46, "font-size": 11, "shadow-opacity": 0.22 } },

      { selector: "node:hover", style: { "border-width": 4, "shadow-opacity": 0.75 } },
      { selector: "node:selected", style: { "border-width": 4, "shadow-opacity": 0.85 } },

      { selector: "node[pending = 1]", style: { "border-style": "dashed", "border-width": 3, opacity: 0.55, "shadow-opacity": 0.12 } },
      { selector: "edge[pending = 1]", style: { "line-style": "dashed", opacity: 0.35, "text-opacity": 0.15 } },

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

    return [...base, ...kindStylesToStylesheet(spec.kindStyles)];
  }, [spec.kindStyles]);

  function clearEmphasis(cy: Core) {
    cy.nodes().removeClass("emph");
    cy.edges().removeClass("emph");
  }

  function emphasizeNeighborhood(cy: Core, nodeId: string) {
    clearEmphasis(cy);
    const node = cy.getElementById(nodeId);
    if (!node || node.empty()) return;
    const neigh = node.closedNeighborhood();
    neigh.nodes().addClass("emph");
    neigh.edges().addClass("emph");
  }

  async function expand(nodeId: string) {
    const cy = cyRef.current;
    if (!cy) return;
    if (loading) return;

    const node = cy.getElementById(nodeId);
    if (!node || node.empty()) return;
    if (node.data("expanded")) return;

    // ★nullにせず、stringで確定させる
    const pendingKeyLocal = `${nodeId}__pending__${Date.now()}`;

    setLoading(true);
    try {
      const focusNode = {
        id: node.data("id") as string,
        label: node.data("label") as string,
        kind: node.data("kind") as string,
        depth: node.data("depth") as number,
      };

      // ★既存の要素ID（node+edge）を送る：edge id 衝突を防ぐ
      const existingElementIds = cy.elements().map((e) => e.id());

      const pendingKind =
        spec.allowedKinds.includes("style")
          ? "style"
          : (spec.allowedKinds.find((k) => k !== "root") ?? spec.root.kind);

      const pendingNodes: KGNodeEl[] = Array.from({ length: 3 }, (_, i) => ({
        data: {
          id: `${pendingKeyLocal}__n${i + 1}`,
          label: labelWithIcon(spec, pendingKind, "生成中…"),
          kind: pendingKind,
          depth: focusNode.depth + 1,
          pending: 1,
          pendingKey: pendingKeyLocal,
        },
      }));

      const pendingEdges: KGEdgeEl[] = pendingNodes.map((n, i) => ({
        data: {
          id: `${pendingKeyLocal}__e${i + 1}`,
          source: focusNode.id,
          target: n.data.id,
          label: "生成中",
          pending: 1,
          pendingKey: pendingKeyLocal,
        },
      }));

      const pendingIncoming: (KGNodeEl | KGEdgeEl)[] = [...pendingNodes, ...pendingEdges];

      setElements((prev) => mergeUniqueElements(prev, pendingIncoming));
      try {
        cy.add(pendingIncoming as any);
      } catch {
        // ignore
      }

      const pendingChildIds = pendingNodes.map((n) => n.data.id);
      if (focusNode.id === rootId) computeRingPositions(cy);
      else placeChildrenForward(cy, focusNode.id, pendingChildIds);

      const res = await fetch(`/api/expand/${domain}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focusNode, existingElementIds }),
      });

      if (!res.ok) throw new Error(await res.text());

      const payload = (await res.json()) as ExpandResponse;

      // pendingを除去
      try {
        cy.remove(`node[pendingKey = "${pendingKeyLocal}"], edge[pendingKey = "${pendingKeyLocal}"]`);
      } catch {
        // ignore
      }
      setElements((prev) => prev.filter((el: any) => el?.data?.pendingKey !== pendingKeyLocal));

      const incoming: (KGNodeEl | KGEdgeEl)[] = [
        ...payload.nodes.map((n) => ({ data: { ...n, label: labelWithIcon(spec, n.kind, n.label) } })),
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
      if (focusNode.id === rootId) computeRingPositions(cy);
      else placeChildrenForward(cy, focusNode.id, childIds);

      if (added) {
        added.style("opacity", 0);
        added.animate({ style: { opacity: 1 } }, { duration: 260 });
      }

      cy.animate({ center: { eles: node }, duration: 260 });
      const nextZoom = Math.min(ZOOM_MAX, Math.max(BASE_ZOOM, cy.zoom() * 1.04));
      cy.animate({ zoom: nextZoom, duration: 260 });
    } finally {
      // 例外時にもpendingが残らないようにする
      try {
        const cy2 = cyRef.current;
        if (cy2) cy2.remove(`node[pendingKey = "${pendingKeyLocal}"], edge[pendingKey = "${pendingKeyLocal}"]`);
      } catch {
        // ignore
      }
      setElements((prev) => prev.filter((el: any) => el?.data?.pendingKey !== pendingKeyLocal));

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
      emphasizeNeighborhood(cy, rootId);
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

      {selected && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 30,
            width: 320,
            maxWidth: "calc(100vw - 32px)",
            color: "#e5e7eb",
            fontFamily: "ui-sans-serif",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(7,9,22,0.65)",
            backdropFilter: "blur(10px)",
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7 }}>Selected</div>
          <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4, whiteSpace: "pre-line" }}>{selected.label}</div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
            kind: {selected.kind} / depth: {selected.depth}
          </div>
        </div>
      )}

      {!hasStarted && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            display: "grid",
            placeItems: "center",
            background: "rgba(5,6,15,0.70)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              width: "min(560px, 92vw)",
              borderRadius: 22,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(11,16,32,0.85)",
              boxShadow: "0 25px 70px rgba(0,0,0,0.55)",
              padding: 22,
              color: "#e5e7eb",
              fontFamily: "ui-sans-serif",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900 }}>{spec.overlayHeadline}</div>
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.78, whiteSpace: "pre-line", lineHeight: 1.5 }}>
              {spec.overlayBody}
            </div>

            <button
              onClick={start}
              style={{
                marginTop: 16,
                width: "100%",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.08)",
                color: "#e5e7eb",
                padding: "12px 14px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              開始する
            </button>
          </div>
        </div>
      )}

      <CytoscapeComponent
        elements={elements as any}
        layout={layout as any}
        style={{ width: "100%", height: "100%" }}
        stylesheet={style as any}
        cy={(cy) => {
          cyRef.current = cy;
          cy.zoom(BASE_ZOOM);
          cy.center();
          cy.removeAllListeners();

          cy.on("tap", "node", (evt) => {
            if (!hasStartedRef.current) return;
            const n = evt.target;
            const id = n.id();

            setSelected({
              id: n.data("id") as string,
              label: n.data("label") as string,
              kind: n.data("kind") as string,
              depth: n.data("depth") as number,
            });

            emphasizeNeighborhood(cy, id);
            expand(id);
          });
        }}
      />
    </main>
  );
}
