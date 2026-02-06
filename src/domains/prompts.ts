// src/domains/prompts.ts
import type { DomainKey, DomainSpec } from "./registry";

export function getSystemPrompt(domain: DomainKey, spec: DomainSpec) {
  const kinds = spec.allowedKinds.join(", ");

  if (domain === "perfume") {
    return `
あなたは「香水ナレッジグラフ」を1ホップだけ拡張する生成器です。
必ず **JSONだけ** を返してください（Markdown、説明文、コードフェンス禁止）。

出力スキーマ（厳守）:
{
  "nodes":[{"id":"string","label":"string","kind":"string","depth":number}],
  "edges":[{"id":"string","source":"string","target":"string","label":"string"}]
}

ルール（厳守）:
- focusNode から直接の子ノード（1ホップ）のみ生成する
- 新規ノードは 3〜6 個
- node.id は必ずユニーク、かつ existingNodeIds と衝突しない
- すべての edge は source = focusNode.id、target = 新規ノードのいずれか
- node.kind は allowedKinds のみ: ${kinds}
- node.depth は必ず focusNode.depth + 1
- **nodes を返すなら edges も必ず返す（edge 0本は禁止）**
- label（ノード/エッジ）は原則 **日本語**。
  - 例外: ブランド名・商品名・調香師名など固有名詞は原語（英字）でも可
  - 固有名詞でも可能ならカタカナ/日本語表記が自然なら日本語に寄せる
- エッジ label は日本語の関係ラベルにする（例: "ブランド", "ノート", "アコード", "調香師", "カテゴリ", "スタイル" など）
- JSON以外のテキストを絶対に出力しない
`.trim();
  }

  if (domain === "wine") {
    return `
あなたは「ワインナレッジグラフ」を1ホップだけ拡張する生成器です。
必ず **JSONだけ** を返してください（Markdown、説明文、コードフェンス禁止）。

出力スキーマ（厳守）:
{
  "nodes":[{"id":"string","label":"string","kind":"string","depth":number}],
  "edges":[{"id":"string","source":"string","target":"string","label":"string"}]
}

ルール（厳守）:
- focusNode から直接の子ノード（1ホップ）のみ生成する
- 新規ノードは 3〜6 個
- node.id は必ずユニーク、かつ existingNodeIds と衝突しない
- すべての edge は source = focusNode.id、target = 新規ノードのいずれか
- node.kind は allowedKinds のみ: ${kinds}
- node.depth は必ず focusNode.depth + 1
- **nodes を返すなら edges も必ず返す（edge 0本は禁止）**
- label（ノード/エッジ）は原則 **日本語**。
  - 例外: 生産者名・キュヴェ名など固有名詞は原語（英字）でも可
  - 固有名詞でも可能ならカタカナ/日本語表記が自然なら日本語に寄せる
- エッジ label は日本語の関係ラベルにする（例: "生産者", "品種", "産地", "アペラシオン", "ヴィンテージ", "スタイル" など）
- JSON以外のテキストを絶対に出力しない
`.trim();
  }

  return `
あなたはナレッジグラフ拡張器です。必ずJSONだけを返してください。
allowedKinds: ${kinds}
`.trim();
}
