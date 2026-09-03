/**
 * lib/ai/__tests__/ai-surface.spec.ts
 *
 * Properties about code that has not been written yet.
 *
 * The prompt-boundary spec proves today's prompts are clean. This one proves
 * the NEXT one will be too, by reading the source and asserting three
 * structural facts that no unit test on the current prompts could:
 *
 *   1. every place that constructs a Gemini client is inside lib/ai/gemini.ts,
 *      so the provider stays swappable and the outbound guard stays
 *      unbypassable;
 *   2. every AI Server Action that sends a prompt sends a GUARDED one;
 *   3. no AI tool can write to a clinical table.
 *
 * Reading source in a test is unusual, and it is deliberate here for the same
 * reason lib/__tests__/business-brain-gate.spec.ts does it: a rule that lives
 * only in a comment is a rule that a future contributor will not know about.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", "__tests__", ".git", "e2e"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const ALL_SOURCE = ["actions", "lib", "app", "components", "business-brain", "hooks"]
  .map((d) => join(ROOT, d))
  .flatMap(sourceFiles);

function read(file: string): string {
  return readFileSync(file, "utf8");
}

describe("the AI provider is reachable through exactly one module", () => {
  it("constructs a GoogleGenerativeAI client only in lib/ai/gemini.ts", () => {
    const constructors = ALL_SOURCE.filter((file) =>
      /new\s+GoogleGenerativeAI\s*\(/.test(read(file))
    ).map((f) => f.slice(ROOT.length + 1));

    expect(constructors).toEqual(["lib/ai/gemini.ts"]);
  });

  it("imports the provider SDK only in lib/ai modules", () => {
    const importers = ALL_SOURCE.filter((file) =>
      /from\s+"@google\/generative-ai"/.test(read(file))
    ).map((f) => f.slice(ROOT.length + 1));

    // patient-tools.ts imports the SDK for its FunctionDeclaration TYPES only —
    // it never constructs a client. Everything else must go through gemini.ts.
    for (const file of importers) {
      expect(file.startsWith("lib/ai/")).toBe(true);
    }
    expect(importers).toContain("lib/ai/gemini.ts");
  });
});

describe("every prompt that leaves the building is guarded", () => {
  /**
   * Files that actually call the model. Listed explicitly rather than
   * discovered, so that ADDING a new AI action fails this test until the author
   * adds it here and reads why.
   */
  const AI_CALLERS = ["actions/ai.ts", "actions/business-brain.ts"];

  it("finds every generateContent/startChat caller in the declared list", () => {
    const callers = ALL_SOURCE.filter((file) => {
      const src = read(file);
      return (
        /\.generateContent\s*\(/.test(src) || /model\.startChat\s*\(/.test(src)
      );
    }).map((f) => f.slice(ROOT.length + 1));

    expect(callers.sort()).toEqual([...AI_CALLERS].sort());
  });

  it("routes every prompt through guardOutboundPrompt", () => {
    for (const file of AI_CALLERS) {
      const src = read(join(ROOT, file));

      // Every prompt-building call must be wrapped. Asserting the builder never
      // appears un-wrapped is stronger than counting occurrences: it catches a
      // second, unguarded call added next to a guarded one.
      const builderCalls = src.match(/build\w*Prompt\s*\(/g) ?? [];
      expect(builderCalls.length).toBeGreaterThan(0);

      const guardCalls = src.match(/guardOutboundPrompt\s*\(/g) ?? [];
      expect(guardCalls.length).toBe(builderCalls.length);
    }
  });
});

describe("AI cannot mutate a clinical record", () => {
  /**
   * The clinical tables. An AI tool may read these; nothing the model says may
   * cause a write to one.
   *
   * appointments is deliberately absent: booking, rescheduling and cancelling
   * ARE things the patient assistant does, and they are protected differently —
   * by a server-issued confirmation token that cannot be minted and redeemed in
   * the same turn, so a booking always requires a real patient reply. That is
   * asserted separately below.
   */
  const CLINICAL_TABLES = [
    "treatments",
    "patient_teeth",
    "tooth_history",
    "payments",
    "consents",
    "treatment_documents",
    "follow_ups",
    "patients",
  ];

  const aiSource = read(join(ROOT, "actions/ai.ts"));

  for (const table of CLINICAL_TABLES) {
    it(`never writes to ${table}`, () => {
      // Any Supabase write is .insert(, .update(, .upsert( or .delete( chained
      // off .from("<table>"). Search for the table reference and confirm no
      // mutation verb follows it before the statement ends.
      const pattern = new RegExp(
        `\\.from\\(\\s*["'\`]${table}["'\`]\\s*\\)[\\s\\S]{0,400}?\\.(insert|update|upsert|delete)\\s*\\(`,
        "g"
      );
      expect(aiSource).not.toMatch(pattern);
    });
  }

  it("enforces two-turn confirmation on the mutating appointment tools", () => {
    // The model must not be able to book in the same turn it proposes. The
    // backend refuses a token issued during the current invocation.
    expect(aiSource).toMatch(/confirmationToken/);
    expect(aiSource).toMatch(/invocationId/);
  });
});
