// src/app/api/expand/route.ts
import { handleExpand } from "@/server/expand";

// 後方互換：既存の /api/expand は perfume を指す
export async function POST(req: Request) {
  return handleExpand("perfume", req);
}
