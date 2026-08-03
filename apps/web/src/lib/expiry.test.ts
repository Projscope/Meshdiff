import { describe, expect, it } from "vitest";
import { isExpired } from "./expiry";

describe("isExpired", () => {
  const now = new Date("2026-01-15T12:00:00.000Z");

  it("returns false for a timestamp in the future", () => {
    expect(isExpired("2026-01-16T12:00:00.000Z", now)).toBe(false);
  });

  it("returns true for a timestamp in the past", () => {
    expect(isExpired("2026-01-14T12:00:00.000Z", now)).toBe(true);
  });

  it("treats an exact match as expired (inclusive boundary)", () => {
    expect(isExpired("2026-01-15T12:00:00.000Z", now)).toBe(true);
  });
});
