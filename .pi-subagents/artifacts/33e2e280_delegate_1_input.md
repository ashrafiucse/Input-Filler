# Task for delegate

You are an independent CODE reviewer (testing coverage lens) for a TypeScript browser-extension project at D:\Input Filler.

Read the plan: D:\Input Filler\docs\plans\2026-08-03-001-feat-cross-browser-input-filler-plan.md (per-unit Test scenarios are the intended coverage).
Then compare the actual tests against the implementation:
- Tests: D:\Input Filler\tests\*.test.ts
- Implementation: D:\Input Filler\src\lib\*.ts and D:\Input Filler\entrypoints\*.ts

Assess: Which behaviors in the implementation have NO test, or where tests assert the wrong thing? Specifically check coverage of: radio group round-robin idempotency, select avoiding disabled/empty options, confirmation-field copy, agree-to-terms, ignoredDomains gating, custom-rule matching/resolution (all 5 fill kinds), template parameterized placeholders, regex guards, chunked rule storage round-trip + stale cleanup, settings migration, and the message contract. Note any plan Test scenario that is not covered.

Rules: Only report real coverage gaps that could let a bug ship. For each: severity P2/P3, the behavior/file lacking coverage, and what test to add. If coverage is adequate, say 'No material testing gaps.' Do not edit files. Return a concise numbered list.

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