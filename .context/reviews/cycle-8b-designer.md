# UI/UX Designer Review — Cycle 8

## Findings

### C8-UX-1: Number formatting inconsistency in recruit results page
- **File**: `src/app/(auth)/recruit/[token]/results/page.tsx` lines 249, 303
- **Severity**: MEDIUM | **Confidence**: High
- **Issue**: `formatScore(totalScore)` and `formatScore(totalPossible)` don't pass `locale`, while `formatDateTimeInTimeZone` in the same file correctly passes it. For Korean or other non-Latin locales, numbers may render differently (e.g., thousands separators). This creates a visual inconsistency where dates use locale-appropriate formatting but scores don't.
- **Fix**: Pass `locale` to all `formatScore` calls.

### C8-UX-2: Contest status badge uses `tracking-wide` which breaks Korean letter spacing
- **File**: Search for `tracking-wide` or `tracking-*` in contest status components
- **Severity**: LOW | **Confidence**: Medium
- **Issue**: Per project rules (CLAUDE.md), Korean text must not have custom letter-spacing. If any contest status badge or label uses `tracking-*` Tailwind utilities, this violates the Korean typography rule. Need to verify all badge/label components.
- **Fix**: Audit all `tracking-*` usage in Korean-visible components and remove or scope to Latin-only contexts.

### C8-UX-3: Rate-limited recruit results page shows same "invalidToken" card — good but undocumented
- **File**: `src/app/(auth)/recruit/[token]/results/page.tsx` lines 63-84
- **Severity**: LOW | **Confidence**: High
- **Issue**: When rate-limited, the page shows the same "invalidToken" card as a failed lookup. This is good for security (no information leakage about the rate limit state) but can be confusing for legitimate users who hit the rate limit accidentally. There's no way for the user to know they should wait and try again. Consider adding a subtle hint like "Please try again in a moment" that doesn't reveal the rate-limit mechanism.
- **Fix**: Add a non-revealing retry hint within the "invalidToken" card.

### C8-UX-4: Public contest page loads slowly for large expired contests
- **File**: `src/app/(public)/contests/[id]/page.tsx` lines 449-455
- **Severity**: MEDIUM | **Confidence**: Medium
- **Issue**: The analytics/replay computation for expired contests can take 500ms+. There is no loading skeleton or streaming — the entire page blocks until all data is ready. For users on slow connections, this creates a blank-screen experience.
- **Fix**: Use React Suspense with a loading skeleton for the analytics section, or precompute and cache.
