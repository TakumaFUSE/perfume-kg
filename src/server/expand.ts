// src/server/expand.ts
import { NextResponse } from "next/server";
import { DOMAINS, type DomainKey } from "@/domains/registry";
import { getSystemPrompt } from "@/domains/prompts";

type Node = {
  id: string;
  label: string;
  kind: string;
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

type ExpandRequest = {
  focusNode: Node;
  existingNodeIds: string[];
};

function looksAsciiOnly(s: string) {
  // 英数字・記号・空白だけ
  return /^[\x00-\x7F]+$/.test(s);
}

function hasJapaneseChar(s: string) {
  // ひらがな/カタカナ/漢字
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
    };
    return m[targetKind] ?? "関連";
  }
  if (domain === "wine") {
    const m: Record<string, string> = {
      producer: "生産者",
      wine: "ワイン",
      region: "産地",
      appellation: "アペラシオン",
      grape: "品種",
      vintage: "ヴィンテージ",
      style: "スタイル",
    };
    return m[targetKind] ?? "関連";
  }
  return "関連";
}

function shouldRequireJapaneseLabel(domain: "perfume" | "wine" | "unknown", kind: string) {
  // “固有名詞になりやすい”ものは英字でも許容（商品名・人名・生産者名など）
  const properNounKinds = new Set<string>([
    "brand",
    "perfume",
    "perfumer",
    "producer",
    "wine",
    "vintage", // 2019 等
  ]);
  if (properNounKinds.has(kind)) return false;

  // その他（概念ノード）は日本語優先
  // note/accord/grape/region/appellation/style/category などは英語一般語が混ざりがちなので強制
  return true;
}

function makeUniqueId(base: string, used: Set<string>) {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let i = 1;
  while (used.has(`${base}__${i}`)) i++;
  const id = `${base}__${i}`;
  used.add(id);
  return id;
}

function sanitizeExpandResult(
  focusId: string,
  focusDepth: number,
  existingNodeIds: string[],
  allowedKinds: string[],
  raw: any
): ExpandResponse {
  const existing = new Set(existingNodeIds);
  const allowed = new Set<string>(allowedKinds);
  const domainGuess = inferDomainFromAllowedKinds(allowedKinds);

  const usedNodeIds = new Set<string>(existingNodeIds);

  // 1) nodes を整形・フィルタ
  const nodes: Node[] = (raw?.nodes ?? [])
    .filter((n: any) => n && typeof n.id === "string")
    .map((n: any) => {
      const id = String(n.id).trim();
      const label = String(n.label ?? n.id).trim();
      const kind = allowed.has(String(n.kind)) ? String(n.kind) : (allowedKinds[allowedKinds.length - 1] ?? "node");
      return { id, label, kind, depth: focusDepth + 1 };
    })
    .filter((n: Node) => n.id.length > 0)
    .filter((n: Node) => !existing.has(n.id))
    .map((n: Node) => {
      // id重複はここで強制回避
      const newId = makeUniqueId(n.id, usedNodeIds);
      return { ...n, id: newId };
    })
    .filter((n: Node) => {
      // 日本語制約（明らかな固有名詞以外）
      if (!shouldRequireJapaneseLabel(domainGuess, n.kind)) return true;
      // 日本語が含まれていればOK
      if (hasJapaneseChar(n.label)) return true;
      // ASCIIのみ（＝英語っぽい一般語）なら落とす
      if (looksAsciiOnly(n.label)) return false;
      // それ以外は許容
      return true;
    });

  const newNodeIds = new Set(nodes.map((n) => n.id));

  // 2) edges を整形（ただし最終的には “必ず補完” する）
  const usedEdgeIds = new Set<string>();
  const edgesFromModel: Edge[] = (raw?.edges ?? [])
    .filter((e: any) => e && e.source != null && e.target != null)
    .filter((e: any) => String(e.source) === focusId)
    .filter((e: any) => newNodeIds.has(String(e.target)))
    .map((e: any, i: number) => {
      const target = String(e.target);
      const base = String(e.id ?? `${focusId}--${target}--${i}`);
      const id = makeUniqueId(base, usedEdgeIds);

      let label = String(e.label ?? "関連");
      // 英語っぽい関係ラベルは日本語に丸める
      if (!hasJapaneseChar(label) && looksAsciiOnly(label)) {
        const targetKind = nodes.find((n) => n.id === target)?.kind ?? "";
        label = edgeLabelJa(domainGuess, targetKind);
      }

      return { id, source: focusId, target, label };
    });

  // 3) 「ノードがあるのにエッジが無い」を禁止：必ず focus->node の edge を作る
  const edgeTargets = new Set(edgesFromModel.map((e) => e.target));
  const supplemented: Edge[] = [];

  for (const n of nodes) {
    if (edgeTargets.has(n.id)) continue;
    const base = `${focusId}--${n.id}--auto`;
    const id = makeUniqueId(base, usedEdgeIds);
    supplemented.push({
      id,
      source: focusId,
      target: n.id,
      label: edgeLabelJa(domainGuess, n.kind),
    });
  }

  const edges = [...edgesFromModel, ...supplemented];

  // 4) 最終ガード：nodesがあるのに edges が 0 は絶対に返さない
  if (nodes.length > 0 && edges.length === 0) {
    // 理論上ここには来ないが保険
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

async function callOpenAI(system: string, user: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY in environment");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(t);
  }

  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("OpenAI returned empty content");
  return content;
}

export async function handleExpand(domain: DomainKey, req: Request) {
  const spec = DOMAINS[domain];
  if (!spec) return new NextResponse("Unknown domain", { status: 404 });

  const body = (await req.json()) as ExpandRequest;
  const focusNode = body?.focusNode;
  const existingNodeIds = body?.existingNodeIds ?? [];

  if (!focusNode?.id || !focusNode?.label) {
    return new NextResponse("Invalid request body", { status: 400 });
  }

  const system = getSystemPrompt(domain, spec);

  // user側にも「日本語優先」を明記（systemと二重で縛る）
  const user = JSON.stringify(
    {
      focusNode,
      existingNodeIds,
      allowedKinds: spec.allowedKinds,
      instruction:
        "必ずJSONのみ。nodesは3〜6。nodesを返すならedgesも必ず返す。ラベルは原則日本語（固有名詞は例外）。",
    },
    null,
    2
  );

  const content = await callOpenAI(system, user);

  let raw: any;
  try {
    raw = JSON.parse(content);
  } catch {
    return new NextResponse(`Model did not return valid JSON:\n${content}`, { status: 500 });
  }

  const cleaned = sanitizeExpandResult(
    focusNode.id,
    focusNode.depth ?? 0,
    existingNodeIds,
    spec.allowedKinds,
    raw
  );

  return NextResponse.json(cleaned);
}
