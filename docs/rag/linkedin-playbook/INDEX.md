# LinkedIn Playbook 2026 — RAG Foundation

Research foundation for a Claude Code plugin that auto-converts blog posts from `alisadikinma.com/blog` to LinkedIn posts (cron-triggered + auto-publish).

## Source

NotebookLM notebook: `LinkedIn Playbook 2026 - Plugin RAG Foundation`
ID: `1a83f5aa-01c0-4d41-a103-2022b656c782` (alias: `li-rag`)
Total sources aggregated: **127** (6 hand-picked seeds + 48 deep research "algorithm 2026" + 49 deep research "hooks & blog conversion" + 10 fast research tools + post-import drift)

## Files

| File | Format | Primary use |
|---|---|---|
| [01-main-playbook.md](01-main-playbook.md) | Narrative reference | Inject as `refs-linkedin-playbook.md` (system prompt). Covers 2026 algorithm mechanics (Depth Score formula, Interest Graph, 3-phase audit), content pillars, cadence, anti-patterns. |
| [02-templates-hooks.md](02-templates-hooks.md) | Structured catalog | Inject as `refs-linkedin-templates.md` (prompt-engineering library). 12 hook formulas, 7 post structure templates, CTA bank, line-break rhythms, blog→LinkedIn conversion rules + 3 end-to-end examples. |
| [03-autopost-tools.md](03-autopost-tools.md) | Briefing doc | Operational decision guide. Recommends **MixPost** as primary (native Laravel package — `composer require`), **Postiz** as OSS backup, **Publer** for Link-in-Comment automation. |
| [04-media-format-decision.md](04-media-format-decision.md) | Decision guide | **GIF vs WEBP vs MP4 answer** (MP4 wins, GIFs treated as static). Blog→LinkedIn format hierarchy with exact engagement benchmarks (carousel 21.77–24.42%, text 3.18–4.10%, single image ~2–3%). Optimal carousel slide count 5–10 (upper limit 20). Plugin decision matrix by content shape. |
| [05-hashtags-timing-language.md](05-hashtags-timing-language.md) | Decision guide | **Hashtags**: 3–5 optimal (or 0), 10+ = −15% reach, Oct-2024 LinkedIn disabled hashtag pages. **Timing**: Tue+Thu Niche Rotation (21:00 WIB US peak / 09:00 WIB ID peak), never dual-post 12h apart. **Language**: English-primary with 2–3 sparse ID terms, never separate EN/ID reposts. |
| [06-carousel-design.md](06-carousel-design.md) | Decision guide | **Carousel design specifics**: 5 cover hook frameworks (PAS, AIDA, Before/After, Loss Aversion, Contrarian), 7–10 slide sweet spot, 1080×1350 PDF portrait, 24pt+ body font, Dead Zones (top 150px + bottom 200px), "Authenticity Palette" (no corporate blue), Direct Answer Blocks for AI search, Human Fingerprint rule, 15 cheat-sheet rules for the `linkedin-carousel` skill. Generated 2026-04-23 via NotebookLM report. |

## Google Docs mirrors

- Main Playbook: https://docs.google.com/document/d/1YxHHWTJQ5YrUqZkfDdXjzTZV2YyBIMBh3k6BAu9mLvI
- Templates & Hooks: https://docs.google.com/document/d/19G-mg2q9hdNLzU_cnDnUdNtBerNsKNRyUSb0v8ZtZ8M
- Auto-Post Tools: https://docs.google.com/document/d/1dyHkBXBVpaw0O9TDWrR81cF6trd_W9opCSZ0v4kdi1w

## Key strategic findings

1. **Algorithm shift 2026**: Social Graph → Interest/Knowledge Graph. Ranking formula: `Depth Score = (Dwell Time × 2) + (Comment Quality × 15) + (Saves/Shares × 5) − (Bounce Rate)`. Comment Quality carries 15× weight — meaningful back-and-forth comments are the highest-leverage signal.
2. **External link penalty**: ~60% reach throttle for links in body text. Three viable workarounds (link-in-comment, Featured Section, post-then-edit after golden hour).
3. **Sweet-spot post format**: Document Carousels (6–12 slides) generate 3.2× more reach than text-only. Text-only sweet spot is 1100–1300 chars with 1–2 sentence paragraphs.
4. **Golden Hour rule**: First-hour engagement on a 5–10% network sample determines distribution. Optimize for dwell time + ≥5-word comments.
5. **Tool choice for Laravel stack**: MixPost is a native Laravel package — directly integrable with the existing Portfolio_v2 backend via `composer require` + queue jobs. No SaaS middleware needed.
6. **Anti-pattern**: "AI Slop" classifier + Knowledge Graph Validation mean off-topic posts from the established niche get throttled. Plugin must stay within Ali's declared pillars (AI Generalist / AI Solopreneur).

## Next steps (IN PROGRESS — 2026-04-23)

- ✅ RAG foundation complete (01-06) — 127 sources
- 🔄 Plugin architecture plan drafted: [../../plans/2026-04-23-plugin-architecture-full-auto.md](../../plans/2026-04-23-plugin-architecture-full-auto.md)
- ⏳ Build Claude Code plugin `linkedin-post-writer` following the `article-content-writer` pattern (6 skills + 1 agent)
- ⏳ Compile refs: `refs-linkedin-playbook.md` + `refs-linkedin-templates.md` + `refs-linkedin-formats.md` + `refs-linkedin-carousel.md` via `scripts/compile-refs.ts`
- ⏳ Implement Portfolio_v2 backend wiring (`LinkedInGenerationService`, `LinkedInPublishService`, cron, FSM)
- ⏳ Install MixPost OSS (`composer require inovector/mixpost`) + OAuth LinkedIn connect
- ⏳ Decision settled: **one canonical LinkedIn post per blog** in v1.0 (no A/B rotation)
- ⏳ Decision settled: **full-auto publishing** with Depth Score ≥80 gate + 15-min Telegram cancel window + kill-switch env var

## Regeneration

To refresh or expand this RAG set:

```bash
# Query the notebook directly for specific topics
nlm notebook query 1a83f5aa-01c0-4d41-a103-2022b656c782 "your question"

# Add more sources and regenerate a report
nlm source add 1a83f5aa-01c0-4d41-a103-2022b656c782 --url "..."
nlm report create 1a83f5aa-01c0-4d41-a103-2022b656c782 --format "Create Your Own" --prompt "..." --confirm
```

Generated: 2026-04-21 (expanded 2026-04-23 with 06-carousel-design.md)
