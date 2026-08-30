import { describe, expect, it } from "vitest";

import {
  UNKNOWN_CLIENT_IP,
  getTrustedClientIp,
} from "@/lib/request-ip";

describe("getTrustedClientIp", () => {
  it("ignore une chaîne X-Forwarded-For forgée", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.44, 203.0.113.10",
      "x-real-ip": "203.0.113.10",
    });

    expect(getTrustedClientIp(headers)).toBe("203.0.113.10");
  });

  it("refuse une adresse absente, invalide ou multiple", () => {
    expect(getTrustedClientIp(new Headers())).toBe(UNKNOWN_CLIENT_IP);
    expect(
      getTrustedClientIp(new Headers({ "x-real-ip": "not-an-ip" })),
    ).toBe(UNKNOWN_CLIENT_IP);
    expect(
      getTrustedClientIp(
        new Headers({ "x-real-ip": "198.51.100.44, 203.0.113.10" }),
      ),
    ).toBe(UNKNOWN_CLIENT_IP);
  });

  it("normalise une IPv4 mappée en IPv6", () => {
    expect(
      getTrustedClientIp(new Headers({ "x-real-ip": "::ffff:203.0.113.10" })),
    ).toBe("203.0.113.10");
  });

  it("accepte une IPv6 valide", () => {
    expect(
      getTrustedClientIp(new Headers({ "x-real-ip": "2001:db8::42" })),
    ).toBe("2001:db8::42");
  });
});
