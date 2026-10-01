// status-feeds: one answer to "is it down?" across the four status formats that matter for
// everyday software: Atlassian Statuspage (Zoom, GitHub, Atlassian, Dropbox, Discord, Figma,
// Cloudflare, OpenAI, Claude...), Slack's own API, Google Workspace's incidents feed, and
// Microsoft's consumer service feed. Pure parsers plus a small fetch helper; no dependencies.

export type Health = "operational" | "degraded" | "outage" | "maintenance" | "unknown";

export interface Incident {
  title: string;
  impact: string;
  started?: string;
  update?: string;
}

export interface ServiceStatus {
  service: string;
  health: Health;
  summary: string;
  incidents: Incident[];
  source: string;
  checkedAt: string;
}

export type Format = "statuspage" | "slack" | "google" | "microsoft";

export interface FeedDefinition {
  name: string;
  format: Format;
  url: string;
  aliases: string[];
  /** Microsoft feed only: the ServiceDisplayName row to read. */
  msService?: string;
}

/** Feeds verified to return JSON on 2026-10-01. */
export const FEEDS: Record<string, FeedDefinition> = {
  zoom: { name: "Zoom", format: "statuspage", url: "https://www.zoomstatus.com/api/v2/summary.json", aliases: ["zoom"] },
  slack: { name: "Slack", format: "slack", url: "https://slack-status.com/api/v2.0.0/current", aliases: ["slack"] },
  github: { name: "GitHub", format: "statuspage", url: "https://www.githubstatus.com/api/v2/summary.json", aliases: ["github"] },
  atlassian: { name: "Atlassian", format: "statuspage", url: "https://status.atlassian.com/api/v2/summary.json", aliases: ["jira", "confluence", "trello", "atlassian"] },
  dropbox: { name: "Dropbox", format: "statuspage", url: "https://status.dropbox.com/api/v2/summary.json", aliases: ["dropbox"] },
  discord: { name: "Discord", format: "statuspage", url: "https://discordstatus.com/api/v2/summary.json", aliases: ["discord"] },
  figma: { name: "Figma", format: "statuspage", url: "https://status.figma.com/api/v2/summary.json", aliases: ["figma"] },
  cloudflare: { name: "Cloudflare", format: "statuspage", url: "https://www.cloudflarestatus.com/api/v2/summary.json", aliases: ["cloudflare"] },
  openai: { name: "OpenAI", format: "statuspage", url: "https://status.openai.com/api/v2/summary.json", aliases: ["openai", "chatgpt"] },
  claude: { name: "Claude", format: "statuspage", url: "https://status.claude.com/api/v2/summary.json", aliases: ["claude", "anthropic"] },
  google: { name: "Google Workspace", format: "google", url: "https://www.google.com/appsstatus/dashboard/incidents.json", aliases: ["gmail", "google meet", "google drive", "google workspace"] },
  outlook: { name: "Outlook.com", format: "microsoft", url: "https://status.cloud.microsoft/api/posts/m365Consumer", aliases: ["outlook", "hotmail"], msService: "Outlook.com" },
  teams: { name: "Microsoft Teams", format: "microsoft", url: "https://status.cloud.microsoft/api/posts/m365Consumer", aliases: ["teams"], msService: "Microsoft Teams Free" },
  onedrive: { name: "OneDrive", format: "microsoft", url: "https://status.cloud.microsoft/api/posts/m365Consumer", aliases: ["onedrive"], msService: "OneDrive" },
};

/** Map a spoken or typed name ("Jira", "gmail", "ChatGPT") to a feed key. */
export function resolve(input: string): string | null {
  const q = input.trim().toLowerCase();
  if (FEEDS[q]) return q;
  for (const [k, f] of Object.entries(FEEDS)) if (f.aliases.includes(q)) return k;
  for (const [k, f] of Object.entries(FEEDS)) if (f.aliases.some((a) => q.includes(a))) return k;
  return null;
}

function base(service: string, source: string, checkedAt = new Date().toISOString()) {
  return { service, source, checkedAt };
}

/** Atlassian Statuspage `summary.json`. */
export function parseStatuspage(d: any, service = d?.page?.name ?? "service", source = d?.page?.url ?? ""): ServiceStatus {
  const ind = d?.status?.indicator;
  let health: Health = ind === "none" ? "operational" : ind === "minor" ? "degraded" : ind === "major" || ind === "critical" ? "outage" : ind === "maintenance" ? "maintenance" : "unknown";
  if (health === "operational" && (d?.scheduled_maintenances ?? []).some((m: any) => m.status === "in_progress")) health = "maintenance";
  const affected = (d?.components ?? []).filter((c: any) => c.status && c.status !== "operational" && !c.group).map((c: any) => c.name);
  const incidents: Incident[] = (d?.incidents ?? []).map((i: any) => ({
    title: String(i.name ?? ""),
    impact: String(i.impact ?? ""),
    started: i.started_at ?? i.created_at,
    update: i.incident_updates?.[0]?.body ? String(i.incident_updates[0].body).slice(0, 300) : undefined,
  }));
  const summary = [d?.status?.description, affected.length ? `Affected: ${affected.slice(0, 6).join(", ")}` : ""].filter(Boolean).join(". ");
  return { ...base(service, source), health, summary: summary || "No description", incidents };
}

/** Slack `api/v2.0.0/current`. */
export function parseSlack(d: any, source = FEEDS.slack.url): ServiceStatus {
  const incidents: Incident[] = (d?.active_incidents ?? []).map((i: any) => ({
    title: String(i.title ?? ""),
    impact: String(i.type ?? ""),
    started: i.date_created,
    update: i.notes?.[0]?.body ? String(i.notes[0].body).replace(/<[^>]+>/g, "").slice(0, 300) : undefined,
  }));
  const health: Health = d?.status === "ok" ? "operational" : incidents.some((i) => i.impact === "outage") ? "outage" : incidents.length ? "degraded" : "unknown";
  return { ...base("Slack", source), health, summary: health === "operational" ? "All Slack services are working" : `${incidents.length} active incident(s)`, incidents };
}

/** Google Workspace `incidents.json`: an incident is ongoing while it has no `end`. */
export function parseGoogle(list: any[], source = FEEDS.google.url): ServiceStatus {
  const open = (list ?? []).filter((i) => !i.end);
  const incidents: Incident[] = open.map((i) => ({
    title: `${i.service_name}: ${String(i.external_desc ?? "").replace(/\*\*/g, "").split("\n").find((l: string) => l.trim() && !/^summary:?$/i.test(l.trim())) ?? ""}`.slice(0, 200),
    impact: String(i.severity ?? i.status_impact ?? ""),
    started: i.begin,
    update: i.most_recent_update?.text ? String(i.most_recent_update.text).replace(/\*\*/g, "").slice(0, 300) : undefined,
  }));
  const health: Health = !open.length ? "operational" : open.some((i) => i.severity === "high") ? "outage" : "degraded";
  return { ...base("Google Workspace", source), health, summary: open.length ? `${open.length} ongoing incident(s)` : "No ongoing incidents", incidents };
}

/** Microsoft consumer feed: one row per service with a free-text Status. */
export function parseMicrosoft(rows: any[], serviceName: string, source = FEEDS.outlook.url): ServiceStatus {
  const row = (rows ?? []).find((r) => r.ServiceDisplayName === serviceName);
  if (!row) return { ...base(serviceName, source), health: "unknown", summary: "Service not listed in the feed", incidents: [] };
  const st = String(row.Status ?? "");
  const health: Health = /operational/i.test(st) ? "operational" : /degrad|advisory|investigat|restor/i.test(st) ? "degraded" : /interrupt|outage/i.test(st) ? "outage" : "unknown";
  const incidents: Incident[] = row.Title ? [{ title: String(row.Title), impact: st, started: row.LastUpdatedTime, update: String(row.Message ?? "").slice(0, 300) }] : [];
  return { ...base(serviceName, source), health, summary: `${serviceName}: ${st || "no status text"}`, incidents };
}

/** Fetch and parse a feed by key (see FEEDS) or by name ("Jira"). Never throws: failures return health "unknown". */
export async function check(nameOrKey: string, fetchImpl: typeof fetch = fetch): Promise<ServiceStatus> {
  const key = resolve(nameOrKey);
  if (!key) return { ...base(nameOrKey, ""), health: "unknown", summary: "No feed known for this service", incidents: [] };
  const f = FEEDS[key];
  try {
    const res = await fetchImpl(f.url, { headers: { "user-agent": "status-feeds (+https://github.com/danielhagever/status-feeds)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    if (f.format === "statuspage") return { ...parseStatuspage(d, f.name, f.url) };
    if (f.format === "slack") return parseSlack(d, f.url);
    if (f.format === "google") return parseGoogle(d, f.url);
    return parseMicrosoft(d, f.msService!, f.url);
  } catch (e) {
    return { ...base(f.name, f.url), health: "unknown", summary: `Could not read the status feed (${(e as Error).message})`, incidents: [] };
  }
}
