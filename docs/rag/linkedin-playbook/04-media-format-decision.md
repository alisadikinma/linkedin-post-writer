# LinkedIn Media Format Decision Guide 2026

Supplementary file answering two high-frequency plugin decisions:
1. Animated visuals — GIF vs WEBP vs native MP4?
2. Blog → LinkedIn — text vs image count vs carousel vs video?

Source: queried against the 127-source `li-rag` NotebookLM notebook on 2026-04-21.

---

## 1. "GIF-looking" animations on LinkedIn are **MP4 videos**, not GIFs

### The reality
When you see a short looping animation in a LinkedIn feed, it's **native MP4 that the platform auto-loops** — not an animated GIF or WEBP. Top creators upload MP4, LinkedIn infrastructure is optimized for video, and animated GIFs are often rendered as **static** images in the organic feed.

### Format support matrix

| Format | LinkedIn organic feed behavior | Reach signal | Recommended? |
|---|---|---|---|
| **Native MP4 video** (15–90s, 4:5 or 9:16) | Auto-plays, auto-loops, tracks dwell time | **+69% YoY performance boost 2024→2026**. Views grew 36% while uploads grew 20% (LinkedIn official) | ✅ **Primary choice for animated content** |
| **Animated GIF** | Often treated as static image — loses animation signal in the feed | LinkedIn Carousel Ads spec explicitly says "non-animated GIFs only" — a tell about platform preference | ⚠️ Avoid for organic posts |
| **Animated WEBP** | No evidence of prioritization, cross-device rendering inconsistent | Not a native citizen of LinkedIn's stack | ❌ Skip |

### LinkedIn Marketing API video specs (what Postiz/MixPost actually ship)
- Format: **MP4** (H.264 codec)
- Resolution: 720p minimum (1080p recommended)
- Aspect ratio: 1:1, 16:9, or **4:5 (best for mobile)**, 9:16 for vertical
- Max file size: 200MB
- Length: 3 seconds – 10 minutes (sweet spot **30–90 seconds**)
- Hard-coded captions mandatory — **85% of video watched muted**
- First 3 seconds must hook (dwell time is graded here)

### Plugin implementation guidance
If the content engine generates animated visuals for LinkedIn:
1. Produce as **MP4 H.264**, not GIF/WEBP
2. 4:5 portrait (1080×1350) or 9:16 vertical for mobile dominance
3. Duration ≤ 60s for completion-rate leverage (70% completion → **3.5× more algorithmic recommendation**)
4. Burn in captions — don't rely on LinkedIn auto-caption
5. If source is a GIF (common from blog images), **convert GIF → MP4** before upload. Sample ffmpeg:
   ```bash
   ffmpeg -i source.gif -movflags +faststart -pix_fmt yuv420p \
     -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" output.mp4
   ```

---

## 2. Blog → LinkedIn: the format performance hierarchy

### The benchmark table (2026 data)

| Format | Median engagement rate | Reach multiplier | Best for |
|---|---|---|---|
| **Document Carousel (PDF)** | **21.77% – 24.42%** | 1.45× | Deep engagement, save-worthy frameworks — **THE WINNER** |
| **Multi-image post** | 6.60% | 1.18× | Announcements, before/after visuals |
| **Native short video** | 5.60% – 6.47% | 1.10× | Reaching NEW audiences (discovery) |
| **Text-only** | 3.18% – 4.10% | 0.88× | Personal narrative, contrarian takes |
| **Single static image** | ~2% – 3% | 1.18× | **Declining — 30% less reach than text** |

### Headline numbers (Buffer's 1M+ post analysis)
- Carousels earn **~3× more engagement than videos**
- Carousels earn **~3× more engagement than multi-image**
- Carousels earn **~6× more engagement than text-only**
- Carousels drive **196% more engagement** than video per follower
- Carousels drive **585% more engagement** than text per follower

### Carousel sweet spot (optimal slide count)

| Slide count | Performance |
|---|---|
| 1–4 slides | Underperforms — not enough swipe signal |
| **5–10 slides** | **Sweet spot** — highest completion + highest dwell time |
| 8–12 slides | Still strong, especially if visual quality is high |
| 10+ slides | Completion rates start dropping |
| **20+ slides** | **~30% reach loss** — users abandon mid-way |

**Plugin default**: 7 slides (middle of sweet spot). Cover + 5 content + CTA.

### Aspect ratio mandate
- **4:5 portrait (1080 × 1350 px)** — maximum vertical mobile real estate
- 1:1 square acceptable but inferior
- Landscape 16:9 actively hurts performance on mobile

### Reach-vs-engagement tradeoff (critical for plugin strategy)
- **Video** = best for *reaching people who don't follow you* (discovery)
- **Carousel** = best for *deep engagement from existing followers*

The plugin should support both depending on idea intent. Default: carousel. Override: video for "contrarian takes" or "breaking news" posts aimed at virality.

---

## 3. Plugin decision matrix: "What format should I generate?"

Given a completed blog post from alisadikinma.com/blog, pick format by content shape:

| Blog post characteristic | Best LinkedIn format | Slide/word target |
|---|---|---|
| Framework / step-by-step tutorial | **Carousel** | 7 slides, 20–40 words/slide |
| Data-driven analysis / benchmarks | **Carousel** with chart screenshots | 5–8 slides |
| Opinion / contrarian take | **Text-only** (1300-char sweet spot) | 1100–1300 chars |
| Personal story / case study | **Text-only** or **short video** (talking head) | Text: 1300 chars / Video: 60s |
| News / product launch | **Multi-image** (3–4 images) or **short video** | 3 images OR 30s video |
| Long-form thought leadership | **Long-form text** (Depth Score king for existing audience) | 2000–3000 chars |
| Visual before/after | **Multi-image** or **carousel** | 2–6 images |

### Zero-click mandate (CRITICAL for all formats)
Never use "click link for more" CTAs in body text. External link = **60% reach penalty**. Plugin must:
1. Put full core value in the LinkedIn post itself
2. Schedule Link-in-Comment 20 minutes later (Postiz/MixPost both support this)
3. Blog URL goes in comment, not body

---

## 4. Bonus: content-web repurposing pattern

One pillar blog post = **3 LinkedIn posts** spaced 24–48 hours apart:

1. **Day 0**: Carousel with framework/steps (highest engagement with followers)
2. **Day 1**: 60s vertical video — talking-head tip on ONE surprising insight (discovery reach)
3. **Day 3**: Text-only contrarian take — the opinion version of the blog's thesis (personal brand anchor)

Plugin architecture implication: support **variant generation** per blog post, not just 1:1 conversion.

---

## 5. Advice for AI-Solopreneur / technical content (from notebook synthesis)

1. **Zero-click first**: Give the "secret sauce" directly — don't tease
2. **4th-grade reading level**: Posts above 10th-grade reading level see **35% less reach**
3. **Short sentences (8–12 words)**, generous line breaks every 1–2 sentences
4. **PAS framework**: Problem → Agitate → Solution — fits technical content naturally
5. **Hook in first 210 chars** must state the payoff, not build to it
6. **Scannable**: numbered lists for steps, bullets for data
7. Repurpose into **content web** (above) instead of one-shot

---

## Citations

Key sources from the notebook (citation numbers map to the query response):
- Buffer's 1M+ LinkedIn post analysis (engagement rates)
- LinkedIn official content distribution guidance (Depth Score + dwell time)
- River Editor 300+ post analysis (format shift table 2024→2026)
- LinkedIn Marketing API video specs (MP4, 720p, 4:5)
- MixPost & Postiz docs (tool media support)
- Hootsuite/Sprout Social 2026 benchmark reports

Regenerate with fresh queries:
```bash
nlm notebook query 1a83f5aa-01c0-4d41-a103-2022b656c782 "your follow-up question"
```
