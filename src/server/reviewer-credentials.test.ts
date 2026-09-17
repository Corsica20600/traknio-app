import assert from "node:assert/strict";
import test from "node:test";
import { verifyReviewerCredentials } from "./reviewer-credentials";

test("only the configured Google Play reviewer credentials authenticate", () => {
  const previousEmail = process.env.TRAKNIO_REVIEWER_EMAIL;
  const previousPassword = process.env.TRAKNIO_REVIEWER_PASSWORD;
  process.env.TRAKNIO_REVIEWER_EMAIL = "google-play-reviewer@example.com";
  process.env.TRAKNIO_REVIEWER_PASSWORD = "reviewer-password-for-test";

  try {
    assert.equal(verifyReviewerCredentials({ email: "GOOGLE-PLAY-REVIEWER@example.com", password: "reviewer-password-for-test" })?.email, "google-play-reviewer@example.com");
    assert.equal(verifyReviewerCredentials({ email: "other@example.com", password: "reviewer-password-for-test" }), null);
    assert.equal(verifyReviewerCredentials({ email: "google-play-reviewer@example.com", password: "wrong" }), null);
  } finally {
    if (previousEmail === undefined) delete process.env.TRAKNIO_REVIEWER_EMAIL;
    else process.env.TRAKNIO_REVIEWER_EMAIL = previousEmail;
    if (previousPassword === undefined) delete process.env.TRAKNIO_REVIEWER_PASSWORD;
    else process.env.TRAKNIO_REVIEWER_PASSWORD = previousPassword;
  }
});
