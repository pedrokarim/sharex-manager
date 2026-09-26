import { describe, expect, it } from "vitest";

import {
  fetchRemoteImage,
  isPrivateAddress,
} from "@/modules/ai-image-gen/lib/remote-image";

describe("ai-image-gen remote image import", () => {
  it("flags loopback, private, link-local and metadata addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.83",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("accepts public addresses", () => {
    for (const address of ["1.1.1.1", "151.101.1.140", "172.32.0.1", "2606:4700::1111"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it("rejects non-http schemes and internal hosts before any request", async () => {
    await expect(fetchRemoteImage("file:///etc/passwd")).rejects.toThrow("http");
    await expect(fetchRemoteImage("http://127.0.0.1:3000/x.png")).rejects.toThrow(
      "adresse interne"
    );
    await expect(fetchRemoteImage("http://user:pass@example.com/x.png")).rejects.toThrow(
      "identifiants"
    );
    await expect(fetchRemoteImage("pas une url")).rejects.toThrow("invalide");
  });
});
