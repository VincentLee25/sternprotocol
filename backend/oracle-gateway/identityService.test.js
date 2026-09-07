const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createIdentityService } = require("./identityService");

function service() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "stern-identity-"));
  const instance = createIdentityService({
    storeFile: path.join(directory, "identities.json"),
    tokenSecret: "test-secret-that-is-longer-than-thirty-two-characters"
  });
  return { instance, directory };
}

const ownerInput = {
  companyName: "Nusantara Trading",
  email: "owner@nusantara.test",
  username: "nusantara.owner",
  walletAddress: "0x1111111111111111111111111111111111111111",
  password: "a sufficiently long owner password"
};

test("registers a company owner and permits role-scoped company users", () => {
  const { instance, directory } = service();
  try {
    const registered = instance.registerCompany(ownerInput);
    assert.equal(registered.user.role, "owner");
    assert.ok(registered.accessToken);

    const created = instance.addCompanyUser(registered.accessToken, registered.company.id, {
      email: "operator@nusantara.test",
      username: "nusantara.operator",
      walletAddress: "0x2222222222222222222222222222222222222222",
      password: "a sufficiently long operator password",
      role: "operator"
    });
    assert.equal(created.user.role, "operator");
    assert.equal(instance.companyUsers(registered.accessToken, registered.company.id).users.length, 2);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("requires an MFA code after the account enables TOTP", () => {
  const { instance, directory } = service();
  try {
    const registered = instance.registerCompany(ownerInput);
    const setup = instance.setupMfa(registered.accessToken);
    assert.match(setup.otpauthUrl, /^otpauth:\/\/totp\//);
    assert.throws(() => instance.confirmMfa({ setupToken: setup.setupToken, code: "000000" }), /Invalid MFA code/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
