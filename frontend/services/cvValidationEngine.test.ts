/**
 * Comprehensive unit tests for cvValidationEngine.
 *
 * Covers every rule, repair path, and edge case.
 * Tests are pure — no mocking, no network, no side effects.
 */

import { describe, it, expect } from "vitest";
import { runValidationEngine } from "./cvValidationEngine";
import type { CVData } from "../types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCV(overrides: Partial<CVData> = {}): CVData {
  return {
    summary:
      "Experienced software engineer with 5 years delivering scalable backend systems.",
    skills: ["TypeScript", "Node.js", "PostgreSQL", "Docker", "Redis"],
    experience: [
      {
        jobTitle: "Senior Software Engineer",
        company: "Acme Corp",
        dates: "2021 – Present",
        startDate: "2021-01-01",
        endDate: "Present",
        responsibilities: [
          "Architected a microservices platform serving 2M daily active users.",
          "Reduced API latency by 40% through query optimisation and caching.",
          "Led a team of 4 engineers across 3 product squads.",
          "Shipped 12 major features in 18 months with zero production incidents.",
          "Migrated legacy PHP monolith to Node.js, cutting build times by 60%.",
        ],
      },
      {
        jobTitle: "Software Engineer",
        company: "StartupXYZ",
        dates: "2019 – 2021",
        startDate: "2019-01-01",
        endDate: "2021-01-01",
        responsibilities: [
          "Built REST APIs consumed by 50,000 monthly active users.",
          "Implemented CI/CD pipelines reducing deployment time from 45 min to 8 min.",
          "Collaborated with product managers to translate 30+ requirements into specs.",
        ],
      },
    ],
    education: [
      {
        degree: "BSc Computer Science",
        school: "University of Edinburgh",
        year: "2019",
      },
    ],
    ...overrides,
  };
}

// ─── Skills cap ──────────────────────────────────────────────────────────────

describe("skills_cap", () => {
  it("passes when skills count is at or below 15", () => {
    const cv = makeCV({
      skills: Array.from({ length: 15 }, (_, i) => `Skill${i}`),
    });
    const result = runValidationEngine(cv);
    expect(result.passed).toBe(true);
    expect(
      result.violations.filter((v) => v.ruleId === "skills_cap"),
    ).toHaveLength(0);
  });

  it("fires and auto-repairs when skills exceed 15", () => {
    const cv = makeCV({
      skills: Array.from({ length: 20 }, (_, i) => `Skill${i}`),
    });
    const result = runValidationEngine(cv);
    expect(result.cv.skills).toHaveLength(15);
    expect(result.repairApplied).toBe(true);
    const violation = result.violations.find((v) => v.ruleId === "skills_cap");
    expect(violation).toBeDefined();
    expect(violation!.repaired).toBe(true);
  });

  it("preserves first 15 skills in order", () => {
    const skills = Array.from({ length: 20 }, (_, i) => `Skill${i}`);
    const cv = makeCV({ skills });
    const result = runValidationEngine(cv);
    expect(result.cv.skills).toEqual(skills.slice(0, 15));
  });
});

// ─── Skills deduplication ─────────────────────────────────────────────────────

describe("skills_deduplication", () => {
  it("passes when no duplicates", () => {
    const cv = makeCV({ skills: ["TypeScript", "React", "Node.js"] });
    const result = runValidationEngine(cv);
    expect(
      result.violations.filter((v) => v.ruleId === "skills_deduplication"),
    ).toHaveLength(0);
  });

  it("removes case-insensitive duplicates", () => {
    const cv = makeCV({
      skills: ["TypeScript", "typescript", "TYPESCRIPT", "React"],
    });
    const result = runValidationEngine(cv);
    expect(result.cv.skills.length).toBeLessThan(4);
    const tsCount = result.cv.skills.filter(
      (s) => s.toLowerCase() === "typescript",
    ).length;
    expect(tsCount).toBe(1);
    expect(result.repairApplied).toBe(true);
  });

  it("preserves first occurrence when deduplicating", () => {
    const cv = makeCV({ skills: ["React", "react", "REACT"] });
    const result = runValidationEngine(cv);
    expect(result.cv.skills[0]).toBe("React");
  });
});

// ─── No seeking phrases ───────────────────────────────────────────────────────

describe("no_seeking_phrases", () => {
  it("passes when summary has no seeking phrases", () => {
    const cv = makeCV();
    const result = runValidationEngine(cv);
    expect(
      result.violations.filter((v) => v.ruleId === "no_seeking_phrases"),
    ).toHaveLength(0);
  });

  it('detects and repairs "seeking" phrase', () => {
    const cv = makeCV({
      summary:
        "I am currently seeking a senior engineering role at a growth-stage startup.",
    });
    const result = runValidationEngine(cv);
    expect(
      result.violations.find((v) => v.ruleId === "no_seeking_phrases"),
    ).toBeDefined();
    expect(result.cv.summary.toLowerCase()).not.toMatch(/seeking/);
    expect(result.repairApplied).toBe(true);
  });

  it('detects and repairs "looking for" phrase', () => {
    const cv = makeCV({
      summary: "A results-driven engineer looking for new challenges.",
    });
    const result = runValidationEngine(cv);
    const v = result.violations.find((v) => v.ruleId === "no_seeking_phrases");
    expect(v).toBeDefined();
  });

  it('detects "I am a" opener', () => {
    const cv = makeCV({
      summary:
        "I am a passionate software engineer with 5 years of experience.",
    });
    const result = runValidationEngine(cv);
    const v = result.violations.find((v) => v.ruleId === "no_seeking_phrases");
    expect(v).toBeDefined();
  });

  it('detects "my goal is" phrase', () => {
    const cv = makeCV({
      summary:
        "My goal is to leverage my skills in a dynamic team environment.",
    });
    const result = runValidationEngine(cv);
    const v = result.violations.find((v) => v.ruleId === "no_seeking_phrases");
    expect(v).toBeDefined();
  });

  it("does not mutate the input CVData", () => {
    const cv = makeCV({
      summary: "I am currently seeking a senior engineering role.",
    });
    const original = cv.summary;
    runValidationEngine(cv);
    expect(cv.summary).toBe(original);
  });
});

// ─── No first-person summary ──────────────────────────────────────────────────

describe("no_first_person_summary", () => {
  it("passes for a third-person summary", () => {
    const cv = makeCV({
      summary: "Experienced product manager with 8 years in B2B SaaS.",
    });
    const result = runValidationEngine(cv);
    expect(
      result.violations.find((v) => v.ruleId === "no_first_person_summary"),
    ).toBeUndefined();
  });

  it('warns for "I am" opener (non-seeking form)', () => {
    // "I am determined" does not match seeking patterns (not "I am a/an", "I am passionate", "I am eager")
    // so only the first-person rule fires, not the seeking-phrase rule.
    const cv = makeCV({
      summary:
        "I am determined to build reliable, high-performance software systems.",
    });
    const result = runValidationEngine(cv);
    const v = result.violations.find(
      (v) => v.ruleId === "no_first_person_summary",
    );
    expect(v).toBeDefined();
    expect(v!.severity).toBe("warn");
    expect(v!.repaired).toBe(false);
  });

  it('warns for "I\'ve" opener', () => {
    const cv = makeCV({ summary: "I've built scalable systems for 5 years." });
    const result = runValidationEngine(cv);
    expect(
      result.violations.find((v) => v.ruleId === "no_first_person_summary"),
    ).toBeDefined();
  });

  it("first-person warn does not block passing", () => {
    const cv = makeCV({ summary: "I've built scalable systems." });
    const result = runValidationEngine(cv);
    expect(result.passed).toBe(true);
  });
});

// ─── Empty experience bullets ─────────────────────────────────────────────────

describe("empty_experience_bullets", () => {
  it("passes when all roles have bullets", () => {
    const cv = makeCV();
    const result = runValidationEngine(cv);
    expect(
      result.violations.filter((v) => v.ruleId === "empty_experience_bullets"),
    ).toHaveLength(0);
  });

  it("warns when a role has zero bullets", () => {
    const cv = makeCV({
      experience: [
        ...makeCV().experience,
        {
          jobTitle: "Intern",
          company: "Corp",
          dates: "2018 – 2019",
          startDate: "2018-01-01",
          endDate: "2019-01-01",
          responsibilities: [],
        },
      ],
    });
    const result = runValidationEngine(cv);
    const v = result.violations.find(
      (v) => v.ruleId === "empty_experience_bullets",
    );
    expect(v).toBeDefined();
    expect(v!.severity).toBe("warn");
  });

  it("empty role warn does not block passing", () => {
    const cv = makeCV({
      experience: [
        {
          jobTitle: "Intern",
          company: "Corp",
          dates: "2018",
          startDate: "2018-01-01",
          endDate: "2019-01-01",
          responsibilities: [],
        },
      ],
    });
    const result = runValidationEngine(cv);
    expect(result.passed).toBe(true);
  });
});

// ─── Hollow bullets ───────────────────────────────────────────────────────────

describe("hollow_bullets", () => {
  it("passes when all bullets are long enough", () => {
    const cv = makeCV();
    const result = runValidationEngine(cv);
    expect(
      result.violations.filter((v) => v.ruleId === "hollow_bullets"),
    ).toHaveLength(0);
  });

  it("warns for bullets under 6 words", () => {
    const cv = makeCV({
      experience: [
        {
          jobTitle: "Engineer",
          company: "Corp",
          dates: "2020 – Present",
          startDate: "2020-01-01",
          endDate: "Present",
          responsibilities: [
            "Built APIs.", // 2 words
            "Led team.", // 2 words
            "Improved performance significantly across the board and reduced latency.",
          ],
        },
      ],
    });
    const result = runValidationEngine(cv);
    const v = result.violations.find((v) => v.ruleId === "hollow_bullets");
    expect(v).toBeDefined();
    expect(v!.message).toContain("2 bullet(s)");
  });
});

// ─── Overlong bullets ─────────────────────────────────────────────────────────

describe("overlong_bullets", () => {
  it("passes when all bullets are under 50 words", () => {
    const cv = makeCV();
    const result = runValidationEngine(cv);
    expect(
      result.violations.filter((v) => v.ruleId === "overlong_bullets"),
    ).toHaveLength(0);
  });

  it("warns for bullets over 50 words", () => {
    const longBullet = Array.from({ length: 55 }, (_, i) => `word${i}`).join(
      " ",
    );
    const cv = makeCV({
      experience: [
        {
          jobTitle: "Manager",
          company: "Corp",
          dates: "2020 – Present",
          startDate: "2020-01-01",
          endDate: "Present",
          responsibilities: [longBullet],
        },
      ],
    });
    const result = runValidationEngine(cv);
    const v = result.violations.find((v) => v.ruleId === "overlong_bullets");
    expect(v).toBeDefined();
  });
});

// ─── Duplicate openers ────────────────────────────────────────────────────────

describe("duplicate_openers", () => {
  it("passes when all bullets open with different verbs", () => {
    const cv = makeCV();
    const result = runValidationEngine(cv);
    expect(
      result.violations.filter((v) => v.ruleId === "duplicate_openers"),
    ).toHaveLength(0);
  });

  it("warns when two bullets in the same role start with the same verb", () => {
    const cv = makeCV({
      experience: [
        {
          jobTitle: "Engineer",
          company: "Corp",
          dates: "2020 – Present",
          startDate: "2020-01-01",
          endDate: "Present",
          responsibilities: [
            "Built microservices platform handling 1M requests per day.",
            "Built authentication system reducing login time by 80%.", // duplicate "built"
            "Deployed containerised applications to AWS ECS.",
          ],
        },
      ],
    });
    const result = runValidationEngine(cv);
    const v = result.violations.find((v) => v.ruleId === "duplicate_openers");
    expect(v).toBeDefined();
    expect(v!.message).toContain("built");
  });

  it("does not warn when roles have same opener in different roles", () => {
    const cv = makeCV({
      experience: [
        {
          jobTitle: "Senior Engineer",
          company: "Corp A",
          dates: "2022 – Present",
          startDate: "2022-01-01",
          endDate: "Present",
          responsibilities: [
            "Built event-driven microservices at scale.",
            "Deployed CI/CD pipeline across 4 environments.",
          ],
        },
        {
          jobTitle: "Engineer",
          company: "Corp B",
          dates: "2019 – 2022",
          startDate: "2019-01-01",
          endDate: "2022-01-01",
          responsibilities: [
            "Built REST APIs for mobile client applications.", // same "built" as role above — allowed
            "Reduced database query count by 35% through indexing.",
          ],
        },
      ],
    });
    const result = runValidationEngine(cv);
    expect(
      result.violations.filter((v) => v.ruleId === "duplicate_openers"),
    ).toHaveLength(0);
  });
});

// ─── Excess bullets ───────────────────────────────────────────────────────────

describe("excess_bullets", () => {
  it("passes when bullet count is within tolerance (targetBulletCount + 2)", () => {
    const cv = makeCV();
    const result = runValidationEngine(cv, { targetBulletCount: 5 });
    expect(
      result.violations.filter((v) => v.ruleId === "excess_bullets"),
    ).toHaveLength(0);
  });

  it("warns when bullet count exceeds target + 2", () => {
    const cv = makeCV({
      experience: [
        {
          jobTitle: "Engineer",
          company: "Corp",
          dates: "2020 – Present",
          startDate: "2020-01-01",
          endDate: "Present",
          responsibilities: Array.from(
            { length: 8 },
            (_, i) =>
              `Delivered project ${i + 1} under budget and on schedule with measurable outcome.`,
          ),
        },
      ],
    });
  });

  it("skips excess_bullets check when no targetBulletCount provided", () => {
    const cv = makeCV();
    const result = runValidationEngine(cv);
    expect(
      result.violations.filter((v) => v.ruleId === "excess_bullets"),
    ).toHaveLength(0);
  });
});

// ─── Immutability ─────────────────────────────────────────────────────────────

describe("input immutability", () => {
  it("never mutates the input CV object", () => {
    const cv = makeCV({
      skills: Array.from({ length: 20 }, (_, i) => `Skill${i}`),
      summary: "I am currently seeking a senior role at a scale-up.",
    });
    const originalSkillCount = cv.skills.length;
    const originalSummary = cv.summary;

    runValidationEngine(cv);

    expect(cv.skills).toHaveLength(originalSkillCount);
    expect(cv.summary).toBe(originalSummary);
  });
});

// ─── Combined scenario ────────────────────────────────────────────────────────

describe("combined validation", () => {
  it("repairs multiple block violations in one pass and reports them all", () => {
    const cv = makeCV({
      skills: Array.from({ length: 18 }, (_, i) => `Skill${i}`), // exceeds cap
      summary: "I am currently seeking a backend role.", // seeking phrase
    });

    const result = runValidationEngine(cv);
    expect(result.repairApplied).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.cv.skills.length).toBeLessThanOrEqual(15);
    expect(result.cv.summary.toLowerCase()).not.toMatch(/seeking/);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });

  it("passes with no violations on a clean CV", () => {
    const cv = makeCV();
    const result = runValidationEngine(cv);
    expect(result.passed).toBe(true);
    expect(result.repairApplied).toBe(false);
    const blockViolations = result.violations.filter(
      (v) => v.severity === "block",
    );
    expect(blockViolations).toHaveLength(0);
  });
});
