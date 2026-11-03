import { describe, expect, it } from "vitest";
import {
  deriveRequestStage,
  STAGE_HINT,
  STAGE_LABEL,
  STAGE_ORDER,
  STAGE_STYLE,
  type RequestStage,
  type WikiIntakeStatus,
  type WikiTaskStatus,
} from "@/lib/wiki-request-stage";

const TASK_STATUSES: WikiTaskStatus[] = [
  "BACKLOG",
  "TODO",
  "DOING",
  "IN_REVIEW",
  "UI_DONE",
  "DONE",
];
const INTAKE_STATUSES: WikiIntakeStatus[] = ["NEW", "TRIAGED", "PROMOTED", "CLOSED"];

describe("deriveRequestStage — the board drives the client's view", () => {
  it("follows the task across the whole board", () => {
    // This is the defect the module exists for: before it, every one of these read
    // "Task created" because nothing ever wrote back to the intake row.
    expect(deriveRequestStage("PROMOTED", "BACKLOG")).toBe("SCHEDULED");
    expect(deriveRequestStage("PROMOTED", "TODO")).toBe("SCHEDULED");
    expect(deriveRequestStage("PROMOTED", "DOING")).toBe("IN_PROGRESS");
    expect(deriveRequestStage("PROMOTED", "IN_REVIEW")).toBe("IN_REVIEW");
    expect(deriveRequestStage("PROMOTED", "DONE")).toBe("DONE");
  });

  it("folds UI_DONE into IN_REVIEW", () => {
    // A hand-off between two of our own people is not a stage of the client's request —
    // and the wiki timeline already folds it the same way.
    expect(deriveRequestStage("PROMOTED", "UI_DONE")).toBe(
      deriveRequestStage("PROMOTED", "IN_REVIEW"),
    );
  });

  it("reads an untriaged request as New and a triaged one as Reviewing", () => {
    expect(deriveRequestStage("NEW", null)).toBe("NEW");
    expect(deriveRequestStage("TRIAGED", null)).toBe("REVIEWING");
  });

  it("never claims a request is scheduled when no task status could be established", () => {
    // `taskId` has no FK, so deleting a task leaves the intake row pointing at nothing.
    // Reporting that as SCHEDULED would be "we could not look" rendered as a fact.
    expect(deriveRequestStage("PROMOTED", null)).toBe("REVIEWING");
    expect(deriveRequestStage("PROMOTED", null)).not.toBe("SCHEDULED");
  });

  it("lets CLOSED win over a task still in flight", () => {
    // "Mark dealt with" is the team explicitly filing the request, and its own tooltip
    // says any task created from it is deliberately untouched. A live task must not put
    // a filed request back on the client's open list.
    for (const task of TASK_STATUSES) {
      expect(deriveRequestStage("CLOSED", task)).toBe("CLOSED");
    }
    expect(deriveRequestStage("CLOSED", null)).toBe("CLOSED");
  });

  it("is total — every (intake, task) pair yields a known stage", () => {
    for (const status of INTAKE_STATUSES) {
      for (const task of [...TASK_STATUSES, null]) {
        const stage = deriveRequestStage(status, task);
        expect(STAGE_ORDER).toContain(stage);
      }
    }
  });

  it("is a pure function of its two arguments", () => {
    expect(deriveRequestStage("PROMOTED", "DOING")).toBe(
      deriveRequestStage("PROMOTED", "DOING"),
    );
  });
});

describe("the stage vocabulary is complete", () => {
  it("labels, hints, styles and order cover exactly the same stages", () => {
    const fromOrder = [...STAGE_ORDER].sort();
    for (const table of [STAGE_LABEL, STAGE_HINT, STAGE_STYLE]) {
      expect(Object.keys(table).sort()).toEqual(fromOrder);
    }
    // No duplicates — STAGE_ORDER drives the filter chips, and a repeat would render twice.
    expect(new Set(STAGE_ORDER).size).toBe(STAGE_ORDER.length);
  });

  it("puts the stages in journey order, so 'earliest stage' is also 'least progressed'", () => {
    const rank = (s: RequestStage) => STAGE_ORDER.indexOf(s);
    expect(rank("NEW")).toBeLessThan(rank("SCHEDULED"));
    expect(rank("SCHEDULED")).toBeLessThan(rank("IN_PROGRESS"));
    expect(rank("IN_PROGRESS")).toBeLessThan(rank("DONE"));
  });

  it("never styles a chip --text-4 on --surface-1", () => {
    // Measured at 4.36:1, under AA for the 10px these chips render at (CLAUDE.md §45.3).
    for (const [stage, style] of Object.entries(STAGE_STYLE)) {
      if (style.includes("bg-[var(--surface-1)]")) {
        expect(style, `${stage} chip`).not.toContain("text-[var(--text-4)]");
      }
    }
  });
});
