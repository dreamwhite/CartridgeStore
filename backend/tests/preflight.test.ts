import { describe, expect, it } from "vitest";

import { validateOidcContract, validatePreflightConfiguration, validateSamlContract } from "../src/preflight/config.js";

function candidateEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    PRG32_BACKEND_CANDIDATE_MODE: "two-service-disposable",
    PRG32_BACKEND_CANONICAL_STORAGE_ROOT: "/disposable/canonical",
    PRG32_BACKEND_DB: "/disposable/canonical/store.sqlite",
    PRG32_BACKEND_STORE_DATA: "/disposable/canonical",
    PRG32_BACKEND_AUTH_WRITE_ENABLED: "true",
    PRG32_BACKEND_AUTH_WRITE_MODE: "test",
    PRG32_BACKEND_AUTH_WRITE_DB: "/disposable/canonical/store.sqlite",
    PRG32_BACKEND_AUTH_DISPOSABLE_ROOT: "/disposable/canonical",
    PRG32_BACKEND_FRONTEND_PUBLIC_ORIGIN: "https://store.prg32.dream.test",
    PRG32_BACKEND_FEDERATION_PUBLIC_ORIGIN: "https://api.prg32.dream.test",
    PRG32_BACKEND_OIDC_PUBLIC_ORIGIN: "https://api.prg32.dream.test",
    PRG32_BACKEND_MDNS_ENABLED: "false",
    PRG32_BACKEND_BACKUP_ENABLED: "false",
    PRG32_BACKEND_SESSION_SECRET: "candidate-session-secret-that-is-longer-than-32-bytes",
    ...overrides
  };
}

describe("configuration preflight", () => {
  it("accepts a disposable canonical candidate without touching paths", () => {
    const result = validatePreflightConfiguration(candidateEnvironment(), "candidate");
    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.status === "PASS")).toBe(true);
    expect(result.sensitive.PRG32_BACKEND_SESSION_SECRET).toBe("PRESENT");
  });

  it("rejects legacy fallbacks, mismatched roots and unsafe origins", () => {
    const result = validatePreflightConfiguration(candidateEnvironment({
      PRG32_STORE_DB: "/legacy/store.sqlite",
      PRG32_BACKEND_STORE_DATA: "/disposable/other",
      PRG32_BACKEND_FRONTEND_PUBLIC_ORIGIN: "http://store.prg32.dream.test/login"
    }), "candidate");
    expect(result.ok).toBe(false);
    expect(result.checks.filter((check) => check.status === "FAIL").map((check) => check.id)).toEqual(expect.arrayContaining([
      "canonical_paths",
      "legacy_fallbacks_disabled",
      "public_origins_https"
    ]));
  });

  it("rejects an enabled candidate writer without a session secret", () => {
    const result = validatePreflightConfiguration(candidateEnvironment({ PRG32_BACKEND_SESSION_SECRET: undefined }), "candidate");
    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.id === "candidate_session_secret")?.status).toBe("FAIL");
    expect(result.sensitive.PRG32_BACKEND_SESSION_SECRET).toBe("MISSING");
  });

  it("never returns secret values in its machine-readable result", () => {
    const secret = "super-secret-value-that-must-not-appear-in-output";
    const result = validatePreflightConfiguration(candidateEnvironment({ PRG32_BACKEND_SESSION_SECRET: secret }), "candidate");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.sensitive.PRG32_BACKEND_SESSION_SECRET).toBe("PRESENT");
  });
});

describe("federation configuration preflight", () => {
  it("accepts generic OIDC relationships without provider-specific assumptions", () => {
    const checks = validateOidcContract({
      providerId: "generic",
      issuer: "https://idp.example.test",
      discoveryEndpoint: "https://idp.example.test/.well-known/openid-configuration",
      jwksUri: "https://idp.example.test/jwks",
      clientId: "prg32-store",
      clientAuthMethod: "none",
      redirectUri: "https://api.prg32.dream.test/api/auth/oidc/generic/callback",
      scopes: ["openid", "profile", "email"],
      pkce: true,
      state: true,
      nonce: true
    }, "https://api.prg32.dream.test");
    expect(checks.every((check) => check.status === "PASS")).toBe(true);
  });

  it("rejects OIDC callbacks on the storefront origin", () => {
    const checks = validateOidcContract({
      providerId: "generic",
      issuer: "https://idp.example.test",
      discoveryEndpoint: "https://idp.example.test/.well-known/openid-configuration",
      jwksUri: "https://idp.example.test/jwks",
      clientId: "prg32-store",
      clientAuthMethod: "client_secret_basic",
      redirectUri: "https://store.prg32.dream.test/api/auth/oidc/generic/callback",
      scopes: ["openid"],
      pkce: true,
      state: true,
      nonce: true
    }, "https://api.prg32.dream.test");
    expect(checks.find((check) => check.id === "oidc_callback_bound")?.status).toBe("FAIL");
  });

  it("requires signed SAML responses, assertions and replay protection", () => {
    const checks = validateSamlContract({
      providerId: "generic",
      spEntityId: "https://api.prg32.dream.test/saml/sp",
      acsUrl: "https://api.prg32.dream.test/api/auth/saml/generic/acs",
      idpEntityId: "https://idp.example.test/saml",
      idpSsoUrl: "https://idp.example.test/saml/sso",
      idpSigningCertificateReference: "secret-ref:saml-idp-cert",
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: true,
      allowedBinding: "HTTP-POST",
      audience: "https://api.prg32.dream.test/saml/sp",
      destination: "https://api.prg32.dream.test/api/auth/saml/generic/acs",
      recipient: "https://api.prg32.dream.test/api/auth/saml/generic/acs",
      replayProtection: true
    }, "https://api.prg32.dream.test");
    expect(checks.every((check) => check.status === "PASS")).toBe(true);
    const rejected = validateSamlContract({
      providerId: "generic",
      spEntityId: "https://api.prg32.dream.test/saml/sp",
      acsUrl: "https://api.prg32.dream.test/api/auth/saml/generic/acs",
      idpEntityId: "https://idp.example.test/saml",
      idpSsoUrl: "https://idp.example.test/saml/sso",
      idpSigningCertificateReference: "secret-ref:saml-idp-cert",
      wantAssertionsSigned: false,
      wantAuthnResponseSigned: true,
      allowedBinding: "HTTP-POST",
      audience: "https://api.prg32.dream.test/saml/sp",
      destination: "https://api.prg32.dream.test/api/auth/saml/generic/acs",
      recipient: "https://api.prg32.dream.test/api/auth/saml/generic/acs",
      replayProtection: false
    }, "https://api.prg32.dream.test");
    expect(rejected.find((check) => check.id === "saml_signature_policy")?.status).toBe("FAIL");
    expect(rejected.find((check) => check.id === "saml_replay_protection")?.status).toBe("FAIL");
  });
});
