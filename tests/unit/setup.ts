// Unit tests must not inherit the shell's or CI's AUTH_URL (CI sets it for the
// build and e2e jobs). With it set, getTrustedAuthHosts() trusts that host and
// also queries system settings, which rejects request-host CSRF fixtures and
// consumes DB mocks meant for the route under test. Tests that need AUTH_URL
// set it themselves.
delete process.env.AUTH_URL;
delete process.env.NEXTAUTH_URL;
