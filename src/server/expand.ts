// src/server/expand.ts
import { NextResponse } from "next/server";
import { DOMAINS, type DomainKey } from "@/domains/registry";
import { getSystemPrompt } from "@/domains/prompts";

type Node = { id: string; label: string; kind: string; depth: number };
type Edge = { id: string; source: string; target: string; label: string };
type ExpandResponse = { nodes: Node[]; edges: Edge[] };

type ExpandRequest = {
  focusNode: Node;
  // ★新：node+edge の id（推奨）
  existingElementIds?: string[];
  // 互換：昔のクライアントが送ってくる想定
  existingNodeIds?: string[];
};

function looksAsciiOnly(s: string) {
  return /^[\x00-\u007F]+$/.test(s);
}

function hasJapaneseChar(s: string) {
  return /[\u3040-\u30FF\u3400-\u9FFF]/.test(s);
}

function inferDomainFromAllowedKinds(allowedKinds: string[]): "perfume" | "wine" | "unknown" {
  const set = new Set(allowedKinds);
  if (set.has("producer") || set.has("grape") || set.has("appellation")) return "wine";
  if (set.has("brand") || set.has("note") || set.has("perfumer")) return "perfume";
  return "unknown";
}

function edgeLabelJa(domain: "perfume" | "wine" | "unknown", targetKind: string) {
  if (domain === "perfume") {
    const m: Record<string, string> = {
      brand: "ブランド",
      perfume: "香水",
      note: "ノート",
      accord: "アコード",
      perfumer: "調香師",
      style: "スタイル",
      category: "カテゴリ",
      root: "関連",
    };
    return m[targetKind] ?? "関連";
  }
  if (domain === "wine") {
    const m: Record<string, string> = {
      producer: "生産者",
      wine: "ワイン",
      region: "地域",
      appellation: "呼称",
      grape: "品種",
      vintage: "ヴィンテージ",
      style: "スタイル",
      root: "関連",
    };
    return m[targetKind] ?? "関連";
  }
  return "関連";
}

function shouldRequireJapaneseLabel(domain: "perfume" | "wine" | "unknown", kind: string) {
  if (domain === "perfume") return !["brand", "perfume", "perfumer"].includes(kind);
  if (domain === "wine") return !["producer", "wine", "grape", "vintage", "appellation"].includes(kind);
  return false;
}

function makeUniqueId(base: string, used: Set<string>) {
  let id = base;
  let i = 1;
  while (used.has(id)) id = `${base}__${i++}`;
  used.add(id);
  return id;
}

function sanitizeExpandResult(
  focusId: string,
  focusDepth: number,
  existingElementIds: string[],
  allowedKinds: string[],
  raw: any
): ExpandResponse {
  const existing = new Set(existingElementIds);
  const allowed = new Set<string>(allowedKinds);
  const domainGuess = inferDomainFromAllowedKinds(allowedKinds);

  // ★node id の衝突回避：既存 element 全体を used に入れる
  const usedNodeIds = new Set<string>(existingElementIds);

  let nodes: Node[] = (raw?.nodes ?? [])
    .filter((n: any) => n && typeof n.id === "string")
    .map((n: any) => {
      const id = String(n.id).trim();
      const label = String(n.label ?? n.id).trim();
      const kind = allowed.has(String(n.kind)) ? String(n.kind) : (allowedKinds[allowedKinds.length - 1] ?? "node");
      return { id, label, kind, depth: focusDepth + 1 };
    })
    .filter((n: Node) => n.id.length > 0)
    // 既存と衝突する素のidはここで落とさず、ユニーク化で吸収
    .map((n: Node) => ({ ...n, id: makeUniqueId(n.id, usedNodeIds) }))
    .filter((n: Node) => {
      if (!shouldRequireJapaneseLabel(domainGuess, n.kind)) return true;
      if (hasJapaneseChar(n.label)) return true;
      if (looksAsciiOnly(n.label)) return false;
      return true;
    });

  // 仕様：3固定（多い場合は切る）
  if (nodes.length > 3) nodes = nodes.slice(0, 3);

  const newNodeIds = new Set(nodes.map((n) => n.id));

  // ★edge id の衝突回避：既存 element 全体を seeded に入れる
  const usedEdgeIds = new Set<string>(existingElementIds);

  const edgesFromModel: Edge[] = (raw?.edges ?? [])
    .filter((e: any) => e && e.source != null && e.target != null)
    .filter((e: any) => String(e.source) === focusId)
    .filter((e: any) => newNodeIds.has(String(e.target)))
    .map((e: any, i: number) => {
      const target = String(e.target);
      const base = String(e.id ?? `${focusId}--${target}--${i}`);
      const id = makeUniqueId(base, usedEdgeIds);

      let label = String(e.label ?? "関連");
      if (!hasJapaneseChar(label) && looksAsciiOnly(label)) {
        const targetKind = nodes.find((n) => n.id === target)?.kind ?? "";
        label = edgeLabelJa(domainGuess, targetKind);
      }
      return { id, source: focusId, target, label };
    });

  // edges 補完（nodesがあるなら必ず張る）
  const edgeTargets = new Set(edgesFromModel.map((e) => e.target));
  const supplemented: Edge[] = [];

  for (const n of nodes) {
    if (edgeTargets.has(n.id)) continue;
    supplemented.push({
      id: makeUniqueId(`${focusId}--${n.id}--auto`, usedEdgeIds),
      source: focusId,
      target: n.id,
      label: edgeLabelJa(domainGuess, n.kind),
    });
  }

  const edges = [...edgesFromModel, ...supplemented];

  if (nodes.length > 0 && edges.length === 0) {
    const first = nodes[0];
    edges.push({
      id: makeUniqueId(`${focusId}--${first.id}--forced`, usedEdgeIds),
      source: focusId,
      target: first.id,
      label: edgeLabelJa(domainGuess, first.kind),
    });
  }

  return { nodes, edges };
}

async function callOpenAI(messages: { role: "system" | "user"; content: string }[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.9,
      max_tokens: 700,
    }),
  });

  if (!res.ok) throw new Error(await res.text());

  const json = await res.json();
  return String(json?.choices?.[0]?.message?.content ?? "");
}

export async function handleExpand(domain: DomainKey, req: Request) {
  const spec = DOMAINS[domain];
  if (!spec) return NextResponse.json({ error: "unknown domain" }, { status: 400 });

  const body = (await req.json()) as ExpandRequest;
  const focusNode = body?.focusNode;

  if (!focusNode?.id) return NextResponse.json({ error: "focusNode is required" }, { status: 400 });

  // ★互換：existingElementIds が無い場合は existingNodeIds を使う（古いクライアント用）
  const existingElementIds =
    Array.isArray(body?.existingElementIds) && body.existingElementIds.length > 0
      ? body.existingElementIds
      : (body?.existingNodeIds ?? []);

  const system = getSystemPrompt(domain, spec);

  const user = `
入力:
focusNode = ${JSON.stringify(focusNode)}
existingElementIds = ${JSON.stringify(existingElementIds)}
注意: 返すのはJSONのみ。スキーマ厳守。
`.trim();

  const content = await callOpenAI([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);

  let raw: any;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    return NextResponse.json({ error: "invalid json from model", detail: String(e) }, { status: 500 });
  }

  const sanitized = sanitizeExpandResult(focusNode.id, focusNode.depth, existingElementIds, spec.allowedKinds, raw);
  return NextResponse.json(sanitized);
}
