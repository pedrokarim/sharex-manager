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
      // Formes que l'analyseur d'URL produit, ou qu'un attaquant peut écrire :
      "::ffff:7f00:1", // ::ffff:127.0.0.1 réécrit par new URL
      "::ffff:a9fe:a9fe", // 169.254.169.254
      "0:0:0:0:0:ffff:7f00:1",
      "::7f00:1", // IPv4 compatible
      "64:ff9b::7f00:1", // NAT64
      "2002:7f00:1::", // 6to4
      "2001:0:4136:e378::1", // Teredo
      "2001:db8::1", // documentation
      "fec0::1",
      "ff02::1",
      "::",
      "192.0.2.10",
      "198.51.100.7",
      "203.0.113.1",
      "pas une adresse",
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
    for (const url of [
      "http://[::ffff:127.0.0.1]:3000/x.png",
      "http://[::ffff:169.254.169.254]/latest/meta-data/",
      "http://2130706433/x.png", // 127.0.0.1 en décimal
      "http://0x7f.1/x.png",
    ]) {
      await expect(fetchRemoteImage(url), url).rejects.toThrow("adresse interne");
    }
    // Un nom qui résout vers la boucle locale est refusé à la connexion.
    await expect(fetchRemoteImage("http://localhost:3000/x.png")).rejects.toThrow(
      "adresse interne"
    );
    await expect(fetchRemoteImage("http://user:pass@example.com/x.png")).rejects.toThrow(
      "identifiants"
    );
    await expect(fetchRemoteImage("pas une url")).rejects.toThrow("invalide");
  });
});
