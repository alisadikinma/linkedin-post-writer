---
name: linkedin-gen
description: End-to-end LinkedIn post generator. Orchestrates linkedin-brief -> linkedin-convert (or linkedin-carousel) -> linkedin-validate and emits a single draft JSON ready for admin panel consumption. Triggers on linkedin-gen, generate linkedin post, blog to linkedin, gen linkedin.
model: sonnet
triggers: [linkedin-gen, generate linkedin post, blog to linkedin, gen linkedin]
---

# linkedin-gen — Blog to LinkedIn Draft Orchestrator

## Purpose

Chain the three content-generation sub-skills (`linkedin-brief` → `linkedin-convert` → `linkedin-validate`) into a single draft JSON that the admin panel consumes. This skill OWNS the pipeline control flow and OWNS NOTHING downstream of it. The orchestrator does NOT publish. It does NOT schedule. It does NOT notify. It does NOT call any backend. The plugin's scope per Addendum 3 is **content generation only** — the admin panel reads the output JSON, shows it to the operator, and decides whether to publish, edit, cancel, or discard.

The text path is production-ready in B5. The carousel path is **deferred to Phase C2** (`linkedin-carousel` skill) and Phase C3 (`linkedin-validate` carousel branch). When a brief routes to `format: 'carousel'`, the orchestrator emits a sentinel status (`deferred_to_phase_c`) with `post: null`, `carousel: null`, `validation: null` — the admin panel is expected to handle that case by parking the draft in a queue awaiting Phase C.

## Reference files

The sub-skills this orchestrator chains each inject their own reference files via `--append-system-prompt-file` when invoked. The orchestrator itself does NOT need additional refs — its job is pipeline control, not content generation. The production `LinkedInGenerationService` wires the four compiled refs (playbook, templates, formats, carousel) into the sub-skill invocations, not this skill.

Test contract note: the orchestrator's tests verify schema, pipeline branching, and output-shape invariants. LLM-driven end-to-end smoke tests live in Phase B6.

## Input

The orchestrator accepts `OrchestratorInputSchema` (see `schema.ts`):

```json
{
  "blog": {
    "url": "https://alisadikinma.com/blog/<slug>",
    "title": "<blog title>",
    "content": "<raw markdown body, >=100 chars>"
  }
}
```

The production bridge (cron → SSH → Claude CLI) is responsible for scraping the blog URL into this shape before handing it over. For interactive debugging, an operator may paste the blog inline.

## Step 1 — Invoke linkedin-brief

Hand the blog object to the `linkedin-brief` skill. The sub-skill returns a `Brief` (format decision, hook selection, pillar routing, pull quote, angle, title draft, conversion confidence).

Validate the returned JSON against `BriefSchema` (imported from `skills/linkedin-brief/schema.ts`). If validation fails:
- Set `status: 'failed'`, `post: null`, `carousel: null`, `validation: null`
- Populate `error: { step: 'brief', message: <zod issue summary>, zod_issues: [...] }`
- Return immediately — do NOT continue the pipeline on a malformed brief

If validation succeeds, carry the `Brief` forward to Step 2.

## Step 2 — Invoke linkedin-convert OR handle carousel deferral

Branch on `brief.format`:

### Step 2a — `format === 'text'`

Invoke `linkedin-convert` with `{ brief, blog }`. The sub-skill returns a `ConvertOutput` (1100-1300 char post, 3-5 hashtags, link-in-comment payload, hook text, paragraph count).

Validate against `ConvertOutputSchema` (imported from `skills/linkedin-convert/schema.ts`). On failure:
- Set `status: 'failed'`, `error.step = 'convert'`
- Keep the `brief` populated, set `post`/`carousel`/`validation` to `null`
- Return immediately

On success, carry `ConvertOutput` forward to Step 3.

### Step 2b — `format === 'carousel'`

DO NOT invoke any carousel skill — it does not exist yet. Phase C2 lands `linkedin-carousel`.

Emit the orchestrator output with:
- `status: 'deferred_to_phase_c'`
- `format: 'carousel'`
- `brief` populated (the B1 output is valuable even without downstream steps)
- `post: null`, `carousel: null`, `validation: null`
- `generated_at: <ISO-8601 timestamp>`

Skip Step 3 and Step 4 — return immediately. The admin panel is responsible for parking this draft and revisiting once Phase C ships.

## Step 3 — Invoke linkedin-validate

Hand `{ format: 'text', post: convertOutput }` to `linkedin-validate`. The sub-skill returns a `Validation` (Depth Score 0-100, passed boolean, failures array, suggestions array).

Validate against `ValidationSchema` (imported from `skills/linkedin-validate/schema.ts`). On failure:
- Set `status: 'failed'`, `error.step = 'validate'`
- Keep `brief` and `post` populated, set `validation` to `null`
- Return immediately

On success, carry `Validation` forward to Step 4.

Optional side-channel: the orchestrator MAY attach the original `brief` to the validate-input envelope so the validator awards a +5 bonus when `brief.pull_quote` appears verbatim in `post.post_text`. The validate skill accepts this as an optional top-level field.

## Step 4 — Assemble final output

Build the single JSON blob matching `OrchestratorOutputSchema`:

```json
{
  "status": "complete",
  "format": "text",
  "brief": { ... },
  "post": { ... },
  "carousel": null,
  "validation": { ... },
  "generated_at": "2026-04-23T09:00:00Z"
}
```

Emit this as pure JSON to stdout. The admin panel parses this blob and drives the operator UI from it.

## Error handling

The orchestrator NEVER retries sub-skill invocations with modified inputs to try to "fix" failures. If `linkedin-validate` returns `passed: false` and `depth_score: 72`, the orchestrator surfaces that result faithfully — it does NOT regenerate the post to try for a higher score. The admin panel decides next action (regenerate with operator feedback, edit manually, cancel).

On schema violation at any step, emit `status: 'failed'` with a structured `error` block. Downstream operators get a precise failure signature (which step, which zod rule) rather than a black-box "something went wrong".

## Interactive vs pipeline mode

**Pipeline mode** (called by admin panel or cron via SSH): emit ONLY the final JSON blob to stdout. No progress text, no commentary, no markdown formatting. One JSON object, one newline.

**Interactive mode** (operator debugging via Claude Code CLI): the pipeline JSON still goes to stdout first. The orchestrator MAY follow it with a human-readable summary (hook line, char count, depth score, failure count) for operator convenience. Summaries are presentational — they are NOT part of the schema contract and must NOT appear in the JSON blob itself.

## Output schema

Authoritative shape: `skills/linkedin-gen/schema.ts` → `OrchestratorOutputSchema`.

Invariants:
- `status='complete'` + `format='text'` ⇒ `post` and `validation` both non-null
- `status='deferred_to_phase_c'` ⇒ `format='carousel'` AND `post=null`
- `status='failed'` ⇒ `error` block present (step, message)
- `carousel` is ALWAYS `null` in the B5 contract — Phase C2 replaces this slot with a real carousel schema

The `superRefine` guards in `schema.ts` enforce every invariant. Output that violates them fails validation.

## Anti-slop restatement

The orchestrator NEVER mutates sub-skill outputs to try to sneak past validation. All banned AI-slop phrases are already caught in B2 (`linkedin-convert` schema) and re-checked in B3 (`linkedin-validate` rubric). The orchestrator's job is to faithfully chain results, not to edit them.

Banned phrases (caught in sub-skills, restated here for cross-skill consistency):

1. "delve into"
2. "unlock the power of"
3. "in today's fast-paced digital landscape"
4. "at the end of the day"
5. "navigating the complexities of"
6. "harness the power of"
7. "seamlessly integrate"

Engagement bait (also caught in sub-skills):

- "Comment YES"
- "Type A for" / "Type A/B"
- "Drop a 🔥"
- "Smash that like button"

If a sub-skill's output contains any of the above, the sub-skill's own schema rejects it before the orchestrator sees the result. In that case, the orchestrator emits `status: 'failed'` with the appropriate step in `error.step` — it does NOT silently scrub the offending substring.
