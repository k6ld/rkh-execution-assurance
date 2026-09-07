# Rule policy and M0 status

The active rule version is `MAXIMO-MMS-KEYWORD-v1`. `engine/assurance-engine.js` is authoritative; the n8n processor is generated from it.

Locked behavior includes PM on-time/early Green, PM incomplete/partial/ongoing Amber, asset-not-found Amber, generic not-found Red, defect without reference Red, not-done Red, CM weak/pending/no-fault/temporary/material Amber, leakage/civil defect Yellow, no-access/unable-to-complete Red, safe phrase boundaries, and severity precedence Red > Amber > Yellow > Green.

The following remain runtime defaults explicitly marked `OPEN` or `PROVISIONAL`, not business-approved facts:

- PM overdue defaults to Amber; TANC changes the recommended action, not the overdue finding.
- PM scope phrases default to Red / Engineer + CAR.
- PM defect with a valid defect/follow-up reference defaults to Green with no further action.
- Generic CM defect identifiers default to Yellow / engineer verification.
- CM duplicate/cancelled/scope phrases default to Amber manual review.
- A CM relationship is Red only when explicitly confirmed unrelated; uncertain lexical relationship routes to Amber review.
- Insufficient CM rectification evidence and missing worklog use conservative review/Red defaults to avoid false Green.
- Unknown work type routes to Amber manual review.
- Eligible statuses remain the current provisional set: COMP, COMPLETED, REVIEWED, CLOSED, CLOSE, COMPLETE.

The supplied M0 expected-results file has 14 DECISION fixtures with `PENDING` outcomes. They are not silently converted into acceptance. Business approval must resolve them before the processor can be called a locked production policy.
