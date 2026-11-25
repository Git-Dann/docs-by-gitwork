import { describe, expect, it } from "vitest";
import { standupPreviewGroups } from "../standup-preview";
import type { TaskDTO } from "@/types/tasks";

function task(id: string, status: string): TaskDTO {
  return { id, title: id, status, client: { id: "c1", name: "Wedge" } } as unknown as TaskDTO;
}

const data = {
  done: [task("shipped", "DONE")],
  doing: [task("multi-day", "DOING"), task("waiting", "IN_REVIEW"), task("ui", "UI_DONE")],
};

describe("standupPreviewGroups", () => {
  it("previews the end-of-day post as the server posts it: done, in review, still in progress", () => {
    const groups = standupPreviewGroups("PM", data);
    expect(groups.map((g) => g.label)).toEqual(["Done today", "In review", "Still in progress"]);
    expect(groups[1].tasks.map((t) => t.id)).toEqual(["waiting", "ui"]);
    expect(groups[2].tasks.map((t) => t.id)).toEqual(["multi-day"]);
  });

  it("still shows in-progress work at the end of the day when nothing was finished", () => {
    const groups = standupPreviewGroups("PM", { done: [], doing: [task("multi-day", "DOING")] });
    expect(groups.flatMap((g) => g.tasks).map((t) => t.id)).toEqual(["multi-day"]);
  });

  it("previews the morning post as in progress then in review, never done", () => {
    const groups = standupPreviewGroups("AM", data);
    expect(groups.map((g) => g.label)).toEqual(["In progress", "In review"]);
    expect(groups.flatMap((g) => g.tasks).some((t) => t.id === "shipped")).toBe(false);
  });

  it("is empty when no update is being sent", () => {
    expect(standupPreviewGroups(null, data)).toEqual([]);
  });
});
