import { createServerFn } from "@tanstack/react-start";
import { assembleBrief, type LilyHit } from "./lilyrose.ts";

type GhItem = {
  html_url?: string;
  full_name?: string;
  description?: string | null;
  owner?: { login?: string };
  stargazers_count?: number;
};

async function githubHits(): Promise<LilyHit[]> {
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const q = encodeURIComponent(`AI agent created:>${since} in:name,description`);
  const res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=updated&per_page=8`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "LilyRose-floor/0.1" },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { items?: GhItem[] };
  return (body.items ?? []).map((item) => ({
    kind: "github" as const,
    url: item.html_url ?? "",
    title: item.full_name ?? "",
    snippet: item.description ?? "",
    author: item.owner?.login ?? "",
    score: Number(item.stargazers_count ?? 0),
  }));
}

export const runLilyRose = createServerFn({ method: "POST" })
  .validator((input: { fundConnected: boolean; paper: boolean; budgetUsd: number; extra?: string }) => input)
  .handler(async ({ data }) => {
    const hits = await githubHits();
    if (data.extra?.trim()) {
      hits.unshift({
        kind: "manual",
        url: "",
        title: data.extra.trim(),
        snippet: data.extra.trim(),
      });
    }
    const brief = assembleBrief({
      hits,
      fundConnected: data.fundConnected,
      paper: data.paper,
      budgetUsd: data.budgetUsd,
    });
    brief.checks.push(`github ${hits.filter((h) => h.kind === "github").length}`);
    return { ok: true as const, brief };
  });
