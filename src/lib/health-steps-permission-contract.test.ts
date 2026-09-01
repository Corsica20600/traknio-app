import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readProjectFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("the Android phone no longer requests or reads Health Connect steps", () => {
  const manifest = readProjectFile("android-private/traknio-android/app/src/main/AndroidManifest.xml");
  const healthConnect = readProjectFile("android-private/traknio-android/app/src/main/java/com/traknio/app/HealthConnectProvider.kt");
  const samsungHealth = readProjectFile("android-private/traknio-android/app/src/main/java/com/traknio/app/SamsungHealthProvider.kt");
  const deviceTokenRoute = readProjectFile("app/api/health/device-token/route.ts");
  const integrationActions = readProjectFile("src/server/integration-actions.ts");

  assert.doesNotMatch(manifest, /READ_STEPS|step_count|ACTIVITY_RECOGNITION/i);
  assert.doesNotMatch(healthConnect, /StepsRecord|\"steps\"|readSteps/i);
  assert.doesNotMatch(samsungHealth, /step_count|StepsType|tryReadLatestStepCount/i);
  assert.doesNotMatch(deviceTokenRoute, /\"Steps\"/);
  assert.doesNotMatch(integrationActions, /\"Steps\"/);
});
