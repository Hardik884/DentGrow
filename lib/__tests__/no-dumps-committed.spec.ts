/**
 * lib/__tests__/no-dumps-committed.spec.ts
 *
 * A production database dump contains auth.users (password hashes),
 * auth.refresh_tokens, and every patient, treatment and payment row. One
 * reaching this repository would be the most serious single thing that could
 * happen to it, and it would be irreversible: git history is distributed, and a
 * secret pushed once is a secret published.
 *
 * The realistic path is not carelessness. It is `pg_dump ... > backup.sql` in
 * the project root during a debugging session, followed by `git add -A`. So
 * this asserts both halves of the defence: nothing is tracked now, and the
 * ignore patterns cover the shapes a dump actually arrives in.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  } catch {
    return "";
  }
}

describe("no database dump is tracked", () => {
  const tracked = git(["ls-files"]).split("\n").filter(Boolean);

  it("has a tracked file list to check — otherwise this passes vacuously", () => {
    expect(tracked.length).toBeGreaterThan(50);
  });

  it("tracks no dump, archive or backup file", () => {
    const suspicious = tracked.filter((path) => {
      const name = path.split("/").pop() ?? "";
      if (/\.(dump|backup)$/i.test(name)) return true;
      if (/\.sql\.(gz|zst|bz2)$/i.test(name)) return true;
      if (/^pg_dump/i.test(name)) return true;
      if (/^backup.*\.sql$/i.test(name)) return true;
      return false;
    });

    expect(suspicious).toEqual([]);
  });

  it("tracks SQL only where SQL belongs", () => {
    // Migrations and the seed are the only SQL this repository should contain.
    // A .sql file anywhere else is either a dump or something that wants
    // explaining.
    const strays = tracked.filter(
      (path) =>
        path.endsWith(".sql") &&
        !path.startsWith("supabase/migrations/") &&
        path !== "supabase/seed.sql"
    );

    expect(strays).toEqual([]);
  });

  it("tracks no environment file", () => {
    const envFiles = tracked.filter((path) => {
      const name = path.split("/").pop() ?? "";
      // .env.example is the committed reference and holds placeholders only.
      return name.startsWith(".env") && name !== ".env.example";
    });

    expect(envFiles).toEqual([]);
  });
});

describe("the ignore patterns cover how a dump actually arrives", () => {
  const gitignore = readFileSync(join(ROOT, ".gitignore"), "utf8");

  it("covers the dump shapes", () => {
    for (const pattern of [
      "backup*.sql",
      "*.dump",
      "*.sql.gz",
      "*.backup",
      "pg_dump*",
      "supabase/backup*.sql",
    ]) {
      expect(gitignore, `.gitignore is missing ${pattern}`).toContain(pattern);
    }
  });

  it("covers local environment files", () => {
    expect(gitignore).toContain(".env.local");
    expect(gitignore).toContain(".env");
  });

  it("points at the remediation that cannot be done from here", () => {
    // A pattern with no explanation gets deleted by someone tidying up.
    expect(gitignore).toContain("docs/INCIDENT-RESPONSE.md");
  });
});
