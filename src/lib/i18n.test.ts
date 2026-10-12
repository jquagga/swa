// Locale parity: every locale ships the same message keys (in particular
// every zfp_* narrative fragment), so adding a language is messages-only.
// Reads the source JSON + project settings from disk (node env).

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MESSAGES_DIR = join(ROOT, "messages");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected ${what} to be an object`);
  }
  return value as Record<string, unknown>;
}

function messageLocales(): string[] {
  const settings = asRecord(
    readJson(join(ROOT, "project.inlang", "settings.json")),
    "project.inlang/settings.json",
  );
  const locales = settings["locales"];
  if (!Array.isArray(locales) || !locales.every((l) => typeof l === "string")) {
    throw new Error("Expected settings.json locales to be string[]");
  }
  return locales as string[];
}

function messagesFor(locale: string): Record<string, string> {
  const data = asRecord(
    readJson(join(MESSAGES_DIR, `${locale}.json`)),
    `${locale}.json`,
  );
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== "string") {
      throw new Error(`Expected ${locale}.json[${k}] to be a string`);
    }
  }
  return data as Record<string, string>;
}

describe("locale parity", () => {
  it("ships a messages file per configured locale", () => {
    const files = readdirSync(MESSAGES_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .sort();
    expect(files).toEqual([...messageLocales()].sort());
  });

  it("keeps identical key sets across locales", () => {
    const locales = messageLocales();
    const base = Object.keys(messagesFor(locales[0] ?? "en")).sort();
    expect(base.length).toBeGreaterThan(0);
    for (const locale of locales.slice(1)) {
      expect(Object.keys(messagesFor(locale)).sort()).toEqual(base);
    }
  });

  it("translates every zfp_* fragment (non-empty, placeholders intact)", () => {
    const en = messagesFor("en");
    const zfpKeys = Object.keys(en).filter((k) => k.startsWith("zfp_"));
    // Adapter and dictionary must stay in sync with this inventory.
    expect(zfpKeys.length).toBeGreaterThan(50);
    // Unit abbreviations are intentionally identical across locales.
    const identicalOk = new Set([
      "zfp_unit_mm",
      "zfp_unit_cm",
      "zfp_unit_mph",
      "zfp_unit_kph",
    ]);
    const placeholders = (s: string): string[] =>
      [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();
    for (const locale of messageLocales()) {
      if (locale === "en") continue;
      const messages = messagesFor(locale);
      for (const key of zfpKeys) {
        const value = messages[key];
        const source = en[key] ?? "";
        expect(value, `${locale}:${key}`).toBeDefined();
        expect(value?.trim().length ?? 0, `${locale}:${key}`).toBeGreaterThan(
          0,
        );
        // Templates keep the same params so the adapter fills them.
        expect(placeholders(value ?? ""), `${locale}:${key}`).toEqual(
          placeholders(source),
        );
        // Plain words must actually be translated (templates may share
        // word order with English, unit abbreviations are universal).
        if (!source.includes("{") && !identicalOk.has(key)) {
          expect(value, `${locale}:${key}`).not.toBe(source);
        }
      }
    }
  });
});
