import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { VERSION } from "../src/version.js";

it("VERSION matches package.json", () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8")) as {
    version: string;
  };
  expect(VERSION).toBe(pkg.version);
});
