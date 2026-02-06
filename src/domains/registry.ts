// src/domains/registry.ts
export type DomainKey = "perfume" | "wine";

export type KindStyle = {
  shape?: string;
  borderColor?: string;
  width?: number;
  height?: number;
  fontSize?: number;
};

export type DomainSpec = {
  key: DomainKey;

  label: string;
  badge: string;
  description: string;
  example: string;

  title: string;
  subtitle: string;

  overlayHeadline: string;
  overlayBody: string;

  root: { id: string; label: string; kind: "root" };

  allowedKinds: string[];
  kindIcons: Record<string, string>;

  /**
   * kindごとの見た目（GraphViewはここだけを見る）
   * - kindが増えてもGraphViewは改修不要
   */
  kindStyles?: Record<string, KindStyle>;
};

export const DOMAINS: Record<DomainKey, DomainSpec> = {
  perfume: {
    key: "perfume",
    label: "香水",
    badge: "🧴 Perfume",
    description: "ブランド・香水・ノート・調香師などの関係をクリックで深掘りします。",
    example: "Dior → Sauvage → Ambroxan / Bergamot → François Demachy",
    title: "Perfume Knowledge Graph",
    subtitle: "ノードをタップすると階層が展開されます",
    overlayHeadline: "香水の世界を、クリックで深掘りする",
    overlayBody:
      "中心（ルート）から外側に行くほど具体化します。2段目以降は「押したノードの先方向」に枝が伸びます。\n※ズームは固定なので画面が急に拡大縮小しません",
    root: { id: "perfume_root", label: "香水", kind: "root" },
    allowedKinds: ["root", "brand", "perfume", "note", "accord", "perfumer", "style", "category"],
    kindIcons: {
      root: "✨",
      brand: "🏷️",
      perfume: "🧴",
      note: "🌿",
      accord: "🧪",
      perfumer: "👤",
      style: "🎛️",
      category: "📦",
    },

    kindStyles: {
      root: { shape: "ellipse", borderColor: "#A78BFA" },
      brand: { shape: "round-rectangle", borderColor: "#60A5FA" },
      perfume: { shape: "ellipse", borderColor: "#FBBF24" },
      note: { shape: "diamond", borderColor: "#F472B6" },
      accord: { shape: "diamond", borderColor: "#F472B6" },
      perfumer: { shape: "hexagon", borderColor: "#34D399" },
      style: { shape: "round-rectangle", borderColor: "#A78BFA" },
      category: { shape: "round-rectangle", borderColor: "#A78BFA" },
    },
  },

  wine: {
    key: "wine",
    label: "ワイン",
    badge: "🍷 Wine",
    description: "生産者・産地・AOC/AVA・品種・キュヴェ・ヴィンテージなどを辿って探索します。",
    example: "Roumier → Chambolle-Musigny → Pinot Noir → 2019",
    title: "Wine Knowledge Graph",
    subtitle: "ノードをタップすると階層が展開されます",
    overlayHeadline: "ワインの世界を、クリックで深掘りする",
    overlayBody:
      "中心（ルート）から外側に行くほど具体化します。2段目以降は「押したノードの先方向」に枝が伸びます。\n※ズームは固定なので画面が急に拡大縮小しません",
    root: { id: "wine_root", label: "ワイン", kind: "root" },
    allowedKinds: ["root", "producer", "wine", "region", "appellation", "grape", "vintage", "style"],
    kindIcons: {
      root: "✨",
      producer: "🏰",
      wine: "🍷",
      region: "🗺️",
      appellation: "📍",
      grape: "🍇",
      vintage: "🗓️",
      style: "🎛️",
    },

    kindStyles: {
      root: { shape: "ellipse", borderColor: "#A78BFA" },
      producer: { shape: "round-rectangle", borderColor: "#60A5FA" },
      wine: { shape: "ellipse", borderColor: "#FBBF24" },
      grape: { shape: "diamond", borderColor: "#F472B6" },
      region: { shape: "hexagon", borderColor: "#34D399" },
      appellation: { shape: "hexagon", borderColor: "#34D399" },
      vintage: { shape: "round-rectangle", borderColor: "#A78BFA" },
      style: { shape: "round-rectangle", borderColor: "#A78BFA" },
    },
  },
};
