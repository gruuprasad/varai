import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLoopbackUrl,
  buildChildEnv,
  isLoopbackHostname,
  isSafeAbsolutePath,
  stopChildProcess,
} from "../../src/runtime/http-runner.js";
import { selectFreshScenarioRun } from "../../src/runtime/commands.js";

test("isLoopbackHostname accepts only 127.0.0.1 and localhost", () => {
  assert.equal(isLoopbackHostname("127.0.0.1"), true);
  assert.equal(isLoopbackHostname("localhost"), true);
  assert.equal(isLoopbackHostname("LOCALHOST"), true);
  assert.equal(isLoopbackHostname("evil.example"), false);
  assert.equal(isLoopbackHostname("0.0.0.0"), false);
  assert.equal(isLoopbackHostname("[::1]"), false);
});

test("isSafeAbsolutePath rejects protocol-relative shapes", () => {
  assert.equal(isSafeAbsolutePath("/health"), true);
  assert.equal(isSafeAbsolutePath("/api/x"), true);
  assert.equal(isSafeAbsolutePath("//evil.example/x"), false);
  assert.equal(isSafeAbsolutePath("health"), false);
  assert.equal(isSafeAbsolutePath("http://127.0.0.1/x"), false);
});

test("assertLoopbackUrl rejects off-box final request URLs", () => {
  assert.doesNotThrow(() => assertLoopbackUrl("http://127.0.0.1:9/health", "http://127.0.0.1:9"));
  assert.throws(
    () => assertLoopbackUrl("http://evil.example/health", "http://127.0.0.1:9"),
    /loopback/,
  );
  assert.throws(
    () => assertLoopbackUrl("http://127.0.0.1:9/health", "http://localhost:9"),
    /origin|loopback|host/i,
  );
});

test("buildChildEnv allowlists PATH/HOME/UV_/credentials/fault and drops secrets", () => {
  const env = buildChildEnv({
    sourceEnv: {
      PATH: "/bin",
      HOME: "/home/dev",
      UV_CACHE_DIR: "/tmp/uv",
      AWS_SECRET_ACCESS_KEY: "should-not-leak",
      VARAI_POC_FAULT: "omit_audit",
      VARAI_POC_EMPLOYEE_1_TOKEN: "t1",
      OTHER: "nope",
    },
    personas: [{ id: "employee-1", credentialEnv: "VARAI_POC_EMPLOYEE_1_TOKEN" }],
  });
  assert.equal(env.PATH, "/bin");
  assert.equal(env.HOME, "/home/dev");
  assert.equal(env.UV_CACHE_DIR, "/tmp/uv");
  assert.equal(env.VARAI_POC_FAULT, "omit_audit");
  assert.equal(env.VARAI_POC_EMPLOYEE_1_TOKEN, "t1");
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(env.OTHER, undefined);
});

test("selectFreshScenarioRun ignores mismatched seed or runtime map hashes", () => {
  const run = {
    id: "verify:old",
    seedHash: "sha256:" + "a".repeat(64),
    runtimeMapHash: "runtime-a",
    scenarios: [{ id: "scenario.x", result: "failed" }],
  };
  assert.equal(
    selectFreshScenarioRun(run, { seedHash: "sha256:" + "b".repeat(64), runtimeMapHash: "runtime-a" }),
    null,
  );
  assert.equal(
    selectFreshScenarioRun(run, { seedHash: run.seedHash, runtimeMapHash: "runtime-b" }),
    null,
  );
  assert.equal(
    selectFreshScenarioRun(run, { seedHash: run.seedHash, runtimeMapHash: "runtime-a" }),
    run,
  );
  assert.equal(selectFreshScenarioRun(null, { seedHash: run.seedHash }), null);
});

test("stopChildProcess escalates SIGTERM to SIGKILL", async () => {
  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
    shell: false,
  });
  await stopChildProcess(child, { graceMs: 50 });
  assert.ok(child.exitCode != null || child.signalCode != null);
});
