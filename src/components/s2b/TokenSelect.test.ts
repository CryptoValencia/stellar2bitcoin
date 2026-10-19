import { describe, expect, it } from "vitest";
import { OPTIONS } from "./TokenSelect";

describe("available swap assets", () => {
  it("keeps USDC available", () => {
    expect(OPTIONS.map((option) => option.v)).toContain("USDC");
  });

  it("does not offer EURC", () => {
    expect(OPTIONS.map((option) => option.v)).not.toContain("EURC");
  });
});