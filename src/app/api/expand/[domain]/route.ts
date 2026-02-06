// src/app/api/expand/[domain]/route.ts
import { handleExpand } from "@/server/expand";
import type { DomainKey } from "@/domains/registry";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ domain: string }> }
) {
  const { domain } = await ctx.params;

  const key = domain as DomainKey;
  return handleExpand(key, req);
}
