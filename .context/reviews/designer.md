# Designer / UI-UX Review — cycle 6 (2026-06-18)

Review of UI changes for v1.1 double support.

## NEW FINDINGS

### DSG6-1 (Low) Float tolerance inputs have no validation feedback
`src/components/problem/function-signature-builder.tsx:239-261`
The absolute/relative error inputs accept any string value. There's no validation
that the input is a valid number or within a reasonable range. An author could
enter `"abc"` or `"1e999"` and the value would be passed to the server, which
would store it and pass it to the worker. The worker's `parse::<f64>()` would
fail on `"abc"`, potentially causing a judge error.

However, the server-side validator (`validators/problem-management.ts`) should
catch this. Need to verify.

Fix: Add client-side validation for tolerance inputs, or verify server-side
validation exists and is correct.
Confidence: Low.

## CARRIED FORWARD

- DSG4-1 (Medium) Local e2e auth broken — FIXED in cycle 4

## VERIFIED

- Responsive rendering: no changes made this cycle, prior cycle's 16 assertions still green
- Korean typography: no custom letter-spacing added
- Float comparison note: correctly shown only for double returns
