import { describe, expect, it } from "vitest";

function sum(a: number, b: number) { return a + b; }

describe("sum", () => {
  it("adds", () => {
    expect(sum(2, 3)).toBe(5);
  });
});
