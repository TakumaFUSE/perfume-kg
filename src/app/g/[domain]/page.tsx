// src/app/g/[domain]/page.tsx
import { notFound } from "next/navigation";
import GraphView from "@/components/GraphView";
import { DOMAINS, type DomainKey } from "@/domains/registry";

export default async function DomainGraphPage(
  props: { params: Promise<{ domain: string }> }
) {
  const { domain } = await props.params;

  const key = domain as DomainKey;
  const spec = DOMAINS[key];
  if (!spec) return notFound();

  return <GraphView domain={key} spec={spec} />;
}
