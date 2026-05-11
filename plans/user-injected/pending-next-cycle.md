# User-Injected TODO for Next Cycle

**Injected at:** 2026-05-11
**Status:** Queued for next RPF cycle

## SMTP Email Notification Feature

Add SMTP email notification functionality to JudgeKit for the following use cases:

1. **Site events notifications** — Send email alerts for important system events
   (e.g., new user registration, failed login attempts, judge worker failures, 
   submission errors requiring attention, system maintenance notices)

2. **Password reset requests** — Allow users to request password reset via email.
   Generate secure reset tokens with expiry, send reset link via SMTP, 
   validate token on reset page, enforce token single-use.

3. **Join/registration email verification** — Send verification email when new 
   users register. Require email verification before account activation. 
   Include verification token/link with expiry. Resend verification option.

## Technical Considerations

- Use existing SMTP configuration from environment variables 
  (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)
- Integrate with existing auth system (NextAuth / custom auth in src/lib/auth/)
- Store tokens securely (hashed or in DB with expiry)
- Use transactional email templates with i18n support
- Rate limit email sending to prevent abuse
- Handle SMTP failures gracefully (queue and retry)
- Ensure email content is accessible and mobile-friendly
- Add admin settings for SMTP configuration

## Priority

This is a HIGH priority feature request that impacts user onboarding 
(password reset, verification) and operational awareness (site events).
