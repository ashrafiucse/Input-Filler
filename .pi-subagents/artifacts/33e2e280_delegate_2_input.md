# Task for delegate

You are an independent CODE reviewer (security + maintainability lens) for a TypeScript browser-extension project at D:\Input Filler.

Read the plan: D:\Input Filler\docs\plans\2026-08-03-001-feat-cross-browser-input-filler-plan.md.
Review the implementation:
- D:\Input Filler\src\lib\rules.ts (regex generation via randexp, ReDoS guards, chunked storage)
- D:\Input Filler\src\lib\orchestrate.ts, settings.ts, detect.ts
- D:\Input Filler\entrypoints\background.ts, content.ts, options\main.ts

Security: This is a client-only extension (no network) with host permission <all_urls> and a content script on all pages. Check: regex DoS guards are actually effective (isSafeRegex, output caps); imported rule JSON handling (validation, injection of fill values); CSS-selector matching in rules (safeMatches); password logToConsole; message handling (untrusted message sources). Maintainability: dead code, duplication, unclear ownership, risky casts.

Rules: Report only real issues. For each: severity P0-P3, file + area, one-sentence issue, concrete fix. The plan's review already addressed regex ReDoS and chunked storage — verify those are actually implemented correctly rather than re-flagging the concept. If nothing material, say 'No material findings.' Do not edit files. Return a concise numbered list.

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