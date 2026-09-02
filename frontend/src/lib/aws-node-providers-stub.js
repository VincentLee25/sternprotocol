// Build-time stub for the Node-only half of the AWS credential chain.
//
// Why this exists: @particle-network/auth-core depends on
// @aws-sdk/credential-providers because Particle custodies MPC key shares with
// AWS Cognito + KMS. It only ever calls `fromCognitoIdentity`, which is
// browser-safe — but importing the package drags in the whole credential chain,
// including the providers that read ~/.aws off disk (node:fs, node:os) and shell
// out to a subprocess (node:child_process). Rollup cannot resolve those for a
// browser target, so the build fails on code that can never execute in a browser.
//
// Every one of these providers is reached through a lazy `await import()` guarded
// by a check for a local AWS profile, so in a browser the branch is unreachable.
// Each export therefore returns a provider that throws when invoked: if the
// assumption is ever wrong, it surfaces as a clear error instead of silently
// yielding undefined credentials.
//
// This file intentionally exports a superset of the names across
// credential-provider-{ini,process,sso,node,web-identity} and token-providers,
// so one alias
// target can stand in for all of them.

function unavailable(name) {
  return () => {
    throw new Error(
      `AWS credential provider "${name}" is not available in the browser build ` +
        "(stubbed in src/lib/aws-node-providers-stub.js). Particle only needs " +
        "fromCognitoIdentity, which is not stubbed."
    );
  };
}

const provider = (name) => () => unavailable(name);

export const fromIni = provider("fromIni");
export const fromProcess = provider("fromProcess");
export const fromSSO = provider("fromSSO");
export const fromSso = provider("fromSso");
export const fromStatic = provider("fromStatic");
export const fromEnvSigningName = provider("fromEnvSigningName");
export const fromLoginCredentials = provider("fromLoginCredentials");
export const nodeProvider = provider("nodeProvider");
export const defaultProvider = provider("defaultProvider");
export const fromTokenFile = provider("fromTokenFile");
export const fromWebToken = provider("fromWebToken");
export const fromContainerMetadata = provider("fromContainerMetadata");
export const fromInstanceMetadata = provider("fromInstanceMetadata");

export const isSsoProfile = () => false;
export const validateSsoProfile = unavailable("validateSsoProfile");
export const credentialsWillNeedRefresh = () => false;
export const credentialsTreatedAsExpired = () => false;
