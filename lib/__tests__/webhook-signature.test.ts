import { verifyWebhookSignature } from "@/lib/webhook-signature";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

const SECRET = "test-webhook-secret";
const BODY = JSON.stringify({ reference: "RB-2026-123456", status: "paid" });

function sign(body: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
}

/**
 * Dedicated unit tests for verifyWebhookSignature (S-6, T-61, S6-27).
 * The route test covers it only indirectly (cross-implementation
 * HMAC at the route level); these cover the branches the route test
 * never reaches: bare-hex signatures, non-hex / odd-length
 * signatures, a body tampered after signing, and empty inputs.
 * The helper uses Web Crypto, so the expected values are computed
 * with node:crypto — two independent implementations.
 */
describe("verifyWebhookSignature", () => {
  it("accepts a correct sha256= prefixed signature", async () => {
    expect(
      await verifyWebhookSignature({
        rawBody: BODY,
        signature: sign(BODY),
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it("accepts a correct bare-hex signature (no sha256= prefix)", async () => {
    const bareHex = createHmac("sha256", SECRET).update(BODY).digest("hex");
    expect(
      await verifyWebhookSignature({
        rawBody: BODY,
        signature: bareHex,
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it("accepts an uppercase-hex signature", async () => {
    const upper = createHmac("sha256", SECRET)
      .update(BODY)
      .digest("hex")
      .toUpperCase();
    expect(
      await verifyWebhookSignature({
        rawBody: BODY,
        signature: `sha256=${upper}`,
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it("rejects a body tampered after signing", async () => {
    const tampered = JSON.stringify({
      reference: "RB-2026-123456",
      status: "failed",
    });
    expect(
      await verifyWebhookSignature({
        rawBody: tampered,
        signature: sign(BODY),
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejects a signature made with a different secret", async () => {
    const other = `sha256=${createHmac("sha256", "another-secret").update(BODY).digest("hex")}`;
    expect(
      await verifyWebhookSignature({
        rawBody: BODY,
        signature: other,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejects non-hex and odd-length signatures without throwing", async () => {
    for (const signature of [
      "sha256=zzzz",
      "sha256=abc",
      "sha256=",
      "not-hex-at-all",
      "sha256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde",
    ]) {
      expect(
        await verifyWebhookSignature({
          rawBody: BODY,
          signature,
          secret: SECRET,
        }),
      ).toBe(false);
    }
  });

  it("rejects a missing signature, an empty secret, and an empty signature", async () => {
    expect(
      await verifyWebhookSignature({
        rawBody: BODY,
        signature: null,
        secret: SECRET,
      }),
    ).toBe(false);
    expect(
      await verifyWebhookSignature({
        rawBody: BODY,
        signature: sign(BODY),
        secret: "",
      }),
    ).toBe(false);
    expect(
      await verifyWebhookSignature({
        rawBody: BODY,
        signature: "",
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("rejects a signature of the wrong length", async () => {
    const short = `sha256=${createHmac("sha256", SECRET).update(BODY).digest("hex").slice(0, 32)}`;
    expect(
      await verifyWebhookSignature({
        rawBody: BODY,
        signature: short,
        secret: SECRET,
      }),
    ).toBe(false);
  });
});
