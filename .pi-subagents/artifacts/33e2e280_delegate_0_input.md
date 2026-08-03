# Task for delegate

You are an independent CODE reviewer (correctness/bugs lens) for a TypeScript browser-extension project at D:\Input Filler.

Read these to understand the contract:
- Plan: D:\Input Filler\docs\plans\2026-08-03-001-feat-cross-browser-input-filler-plan.md (the Requirements R1-R18, KTDs, and per-unit goals/verification)
Then review the IMPLEMENTATION for correctness bugs:
- D:\Input Filler\src\lib\orchestrate.ts (fill orchestration: skip gate, confirmation/agree-terms, page-level name consistency, no-form fallback, shadow/iframe discovery)
- D:\Input Filler\src\lib\detect.ts, fillers.ts, rules.ts, settings.ts, generators.ts, text.ts, rng.ts, rules-ui.ts, popup-status.ts, background-actions.ts
- D:\Input Filler\entrypoints\background.ts, content.ts, popup\main.ts, options\main.ts

Hunt specifically for: logic errors, off-by-one/edge cases, incorrect event dispatch, incorrect skip logic, confirmation-field copy bugs, radio/select/checkbox mishandling, settings merge/migration bugs, message-contract mismatches between background/content/popup, and any behavior that contradicts an R-ID in the plan.

Rules: Be concrete and only report real issues (no style nits). For each finding: severity P0-P3, file + line/area, one-sentence issue, a concrete suggested fix. Verify by reading the actual code (don't speculate). If you find nothing material, say 'No material correctness findings.' Do not edit files. Return a concise numbered list.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```