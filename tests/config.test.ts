import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { DEFAULT_CONFIG, loadConfig, resolveConfig } from "../src/config.js";
import { ValidationError } from "../src/domain/load.js";

describe("config", () => {
  it("config/default.yaml matches the built-in defaults", () => {
    const file: unknown = parse(
      readFileSync(join(import.meta.dirname, "..", "config", "default.yaml"), "utf8"),
    );
    expect(file).toEqual(DEFAULT_CONFIG);
  });

  it("layers a partial override on the defaults", () => {
    const config = resolveConfig({ friction: { weights: { wait: 0.5 } } });
    expect(config.friction.weights.wait).toBe(0.5);
    expect(config.friction.weights.time).toBe(DEFAULT_CONFIG.friction.weights.time);
    expect(config.simulation).toEqual(DEFAULT_CONFIG.simulation);
  });

  it("rejects unknown keys and invalid values with paths", () => {
    expect(() => resolveConfig({ friction: { weights: { speed: 1 } } })).toThrow(/speed/);
    try {
      resolveConfig({ suitability: { taskTypeFit: { extraction: 1.4 } } });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).issues[0]).toMatch(/^suitability\.taskTypeFit\.extraction/);
    }
  });

  it("rejects all-zero weights", () => {
    expect(() =>
      resolveConfig({ friction: { weights: { time: 0, rework: 0, handoffs: 0, wait: 0 } } }),
    ).toThrow(/at least one weight/);
  });

  it("loads overrides from a YAML file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "audit-config-"));
    const path = join(dir, "custom.yaml");
    writeFileSync(path, "simulation:\n  seed: 7\n");
    const config = await loadConfig(path);
    expect(config.simulation.seed).toBe(7);
  });
});
