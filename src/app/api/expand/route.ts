// src/app/api/expand/route.ts
import { NextResponse } from "next/server";

type NodeKind = "root" | "company" | "genre" | "product";

type Node = {
  id: string;
  label: string;
  kind: NodeKind;
  depth: number;
};

type Edge = {
  id: string;
  source: string;
  target: string;
  label: string;
};

type ExpandResponse = {
  nodes: Node[];
  edges: Edge[];
};

const SYSTEM = `
You generate a small knowledge-graph expansion for perfumes.

Return ONLY valid JSON matching this schema:
{
  "nodes":[{"id":"...", "label":"...", "kind":"root|company|genre|product", "depth":0}],
  "edges":[{"id":"...", "source":"...", "target":"...", "label":"..."}]
}

Core rules:
- Expand from the given "focus node" outward (children only).
- Add 3 to 6 nodes max each call (small expansion).
- "depth" must be focus.depth + 1 for all NEW nodes.
- Node ids must be unique, short, stable, URL-safe (use lowercase, dashes).
- Edges must have meaningful Japanese labels describing the relationship.
- Prefer well-known, non-controversial examples.
- Do not repeat nodes already provided in "existingNodeIds".

VERY IMPORTANT (strict constraints):
- Return ONLY edges that originate from the focus node.
- Every edge.source MUST equal focusNode.id.
- Do NOT create edges between any other nodes (existing or newly created).
- Every edge.target MUST be one of the NEW nodes you created in this call.
- Do NOT reference existing nodes as edge targets (except focus node as the source).
- If you are unsure, generate fewer nodes rather than violating constraints.

Output only JSON. No markdown. No extra text.
`;

// Optional: make GET return a helpful message (so browser GET doesn't show 405)
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Use POST with JSON body: { focusNode, existingNodeIds }",
  });
}

function sanitizeExpandResult(
  focusId: string,
  focusDepth: number,
  existingNodeIds: string[],
  raw: any
): ExpandResponse {
  const existing = new Set(existingNodeIds);

  const allowedKinds = new Set<NodeKind>(["root", "company", "genre", "product"]);

  // nodes: existingIDは除外 / depth強制 / 基本整形
  const nodes: Node[] = (raw?.nodes ?? [])
    .filter((n: any) => n && typeof n.id === "string")
    .map((n: any) => ({
      id: String(n.id).trim(),
      label: String(n.label ?? n.id).trim(),
      kind: (allowedKinds.has(n.kind) ? n.kind : "product") as NodeKind,
      depth: focusDepth + 1, // ★強制
    }))
    .filter((n: Node) => n.id.length > 0 && !existing.has(n.id));

  // 新規ノードIDセット
  const newNodeIds = new Set(nodes.map((n) => n.id));

  // edges: focus->newNodes 以外は全捨て / source強制
  const edges: Edge[] = (raw?.edges ?? [])
    .filter((e: any) => e && e.source != null && e.target != null)
    .filter((e: any) => String(e.source) === focusId) // ★ここが肝：focus以外から生えるのを禁止
    .filter((e: any) => newNodeIds.has(String(e.target))) // ★子ノードのみに限定
    .map((e: any, i: number) => ({
      id: String(e.id ?? `${focusId}--${String(e.target)}--${i}`),
      source: focusId, // ★強制
      target: String(e.target),
      label: String(e.label ?? "関連"),
    }));

  // もしLLMがedgeを返してこなかった/全部捨てられた場合でも、
  // nodesがあるなら自動でfocus->childを補完（UI上の「生えた感」を保証）
  const edgeTargets = new Set(edges.map((e) => e.target));
  const supplemented: Edge[] = [];
  for (const n of nodes) {
    if (edgeTargets.has(n.id)) continue;
    supplemented.push({
      id: `${focusId}--${n.id}--auto`,
      source: focusId,
      target: n.id,
      label: "関連",
    });
  }

  return { nodes, edges: [...edges, ...supplemented] };
}

async function callOpenAI(body: any): Promise<ExpandResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${txt}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "";
  return JSON.parse(content);
}

export async function POST(req: Request) {
  try {
    const { focusNode, existingNodeIds } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
    }

    if (!focusNode?.id || focusNode?.depth == null) {
      return NextResponse.json({ error: "focusNode is required" }, { status: 400 });
    }

    const user = {
      focusNode, // {id,label,kind,depth}
      existingNodeIds: existingNodeIds ?? [],
      goal: "中心から端に行くほど具体（company/genre/product）になるように展開して",
      note: "香水ナレッジグラフ。会社→ジャンル→具体的商品を作りたい。",
    };

    const completionBody = {
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(user) },
      ],
      temperature: 0.4,
    };

    const raw = await callOpenAI(completionBody);

    const cleaned = sanitizeExpandResult(
      String(focusNode.id),
      Number(focusNode.depth),
      Array.isArray(existingNodeIds) ? existingNodeIds : [],
      raw
    );

    return NextResponse.json(cleaned);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
