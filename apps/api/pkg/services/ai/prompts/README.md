# Prompt templates

One `.md` file per pipeline step, each with a version header. Prompts are code:
they are reviewed, versioned, and changed together with `schemas.go`.

| file | step | status |
|---|---|---|
| `normalize_wishlist.md` | free text → tags + poi_id | TODO A3.3 |
| `build_frame.md`        | anchors → day skeleton    | TODO A4.3 |
| `generate_plan.md`      | frame + wishlists → PlanDraft | TODO A4.4 |
| `repair_plan.md`        | PlanDraft + issues → fixed draft | TODO A4.6 |
| `explain_plan.md`       | plan → rationales + open questions | TODO A4.7 |
| `parse_ticket.md`       | pasted ticket text → ParsedTicket | TODO A1.2 |

Rules
- state the output JSON schema explicitly and demand JSON only
- list the available tools and forbid guessing hours / prices / travel times
- keep the Thai output voice consistent with the brand tone (DEV_SPEC §15, TBD)
