/**
 * Build-time opt-in; the backend target is never exposed to browser code.
 *
 * Dual-origin mode is itself an explicit ownership decision for browser auth.
 * Read that public flag directly as well as the derived auth flag from
 * next.config. This keeps Turbopack/dev and production bundles consistent
 * when next.config env injection is not reflected in a client module.
 */
export const authIntegrationEnabled =
  process.env.NEXT_PUBLIC_AUTH_INTEGRATION_ENABLED === "true" ||
  process.env.NEXT_PUBLIC_PRG32_DUAL_ORIGIN_ENABLED === "true";
