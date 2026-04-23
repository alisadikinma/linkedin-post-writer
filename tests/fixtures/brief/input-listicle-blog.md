# 8 AI Agent Patterns I Used to Ship 12 Client Projects in 90 Days

I spent Q1 2026 shipping agent-driven features for 12 different clients. None of them looked the same from the outside — one was a legal doc summarizer, one was a real-estate listing bot, one was a voice agent for a dental clinic. But under the hood, I kept reaching for the same 8 patterns. Over and over.

Here is the complete list, in the order I usually introduce them when I am onboarding a new client.

## 1. The Gatekeeper pattern

Put a cheap, fast model in front of your expensive one. The cheap model classifies the incoming request — is this a support question, a sales question, a refund demand? — and routes accordingly. I use Haiku for gatekeeping and Sonnet for the actual reasoning. Cuts 60% of Sonnet tokens on a typical workload.

The mistake people make: they let the expensive model do its own routing. That works, but you pay Sonnet prices to do Haiku work.

## 2. The Scribe pattern

Every agent should write down what it did. Not logs — actual structured writeups. "I received X, checked Y, decided Z, because of W." Store these in Postgres or a file. They are the difference between an agent you can debug and an agent that silently fails.

I have saved client relationships three times by being able to show exactly what the agent did and why. Not "the AI hallucinated." Show the decision trace.

## 3. The Supervisor pattern

When one agent spawns another agent, the parent is the supervisor. It decides what the child is allowed to do. If the child tries to write to a database the parent did not authorize, the supervisor blocks it. This sounds like over-engineering. It is not. It is the difference between a demo and a production system.

## 4. The Circuit Breaker pattern

Every external API call has a budget — 3 attempts, 10 seconds each, then abort and tell a human. Agents without circuit breakers are the ones that cost clients $4,000 in API fees overnight. I have seen it happen twice.

## 5. The Receipt pattern

When an agent completes a task, it emits a receipt. The receipt has: what the task was, what the outcome was, what the confidence is, and what a human should verify. The receipt goes to a queue. Humans review the queue when they have time. This is how you scale past "the AI did something and now I am confused."

## 6. The Handoff pattern

Agents should know when they are out of their depth. A support agent that does not know the answer should escalate — not make something up. The handoff pattern is explicit: the agent emits "escalate to human" as a tool call, the system routes the conversation to a queue, a human picks it up with full context.

This is the single biggest reason client-facing agents lose trust. They fake answers instead of handing off.

## 7. The Rehearsal pattern

Before deploying an agent to production, it runs against a fixture library of 100+ real conversations. Every change is replayed against the fixtures. If the agent starts answering 3 fixture conversations differently, you find out in 30 seconds — not when a customer complains.

I cannot ship an agent to a client without this. It is the cheapest insurance in software.

## 8. The Graveyard pattern

Kill your agents. When an agent stops being useful — the task it automated is no longer needed, the API changed, the client pivoted — retire it explicitly. Move the code to a graveyard folder. Document why. Do not let dead agents pile up in production pretending to still work.

Half of my inherited client codebases have 4+ "zombie" agents running that nobody remembers building. Every one of them is a security risk.

## Which one breaks first in your stack?

If you have shipped any agent-driven feature to a real customer, one of these 8 patterns is probably the one you are skipping. I would bet money it is the Scribe pattern or the Circuit Breaker. Those are the two I had to learn the hard way.
