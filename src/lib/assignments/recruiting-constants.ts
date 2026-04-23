/**
 * Shared constants for recruiting invitation routes.
 * Ensures consistent expiry limits across single, bulk, and PATCH routes.
 */

/** Maximum expiry duration from creation time (~10 years). */
export const MAX_EXPIRY_MS = 10 * 365.25 * 24 * 60 * 60 * 1000;
