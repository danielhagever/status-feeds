# status-feeds

**One answer to "is it down, or is it me?"** across the status feeds that matter for everyday software:

| Format | Services |
|---|---|
| Atlassian Statuspage (`summary.json`) | Zoom, GitHub, Jira/Confluence/Trello, Dropbox, Discord, Figma, Cloudflare, OpenAI, Claude |
| Slack (`api/v2.0.0/current`) | Slack |
| Google Workspace (`incidents.json`) | Gmail, Meet, Drive, Docs, Calendar |
| Microsoft consumer feed (`api/posts/m365Consumer`) | Outlook.com, Teams, OneDrive |

Every feed becomes the same shape:

```ts
{ service, health: "operational" | "degraded" | "outage" | "maintenance" | "unknown", summary, incidents: [{ title, impact, started, update }], source, checkedAt }
```

## Use

```ts
import { check, resolve, parseStatuspage } from "status-feeds";

await check("Jira");            // resolves "Jira" to Atlassian, fetches, parses
await check("my gmail is down"); // resolves to Google Workspace
parseStatuspage(json, "Zoom");  // or parse a response you already have
```

`check` never throws: a network or HTTP failure returns `health: "unknown"` with the reason, so a voice assistant can say "I couldn't read the status page" instead of crashing.

## Why

Built for [Deskside](https://github.com/danielhagever/deskside), an IT help desk for Alexa+, where the first question for any "it's not working" is whether the service itself is down. The four formats differ in where they hide the answer (an `indicator`, a `status: "ok"`, an incident without an `end`, a free-text `Status`), and several hosts moved (`zoom.us` to `zoomstatus.com`, `status.slack.com` to `slack-status.com`). This package keeps that knowledge in one tested place.

## Tests

```bash
npm test
```

Tests run against real responses captured on 2026-10-01 (`test/fixtures`). One fixture (`google-ongoing-derived.json`) is a real Google incident with its `end` removed, to exercise the ongoing path. Zero dependencies; Node 22.18+ runs the TypeScript sources directly.

## License

MIT
