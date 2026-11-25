import { describe, expect, it } from "vitest";
import { pickOwnClient } from "../clients";

const mine = [
  { id: "1", name: "Wedge", slug: "wedge" },
  { id: "2", name: "Campfire", slug: "campfire" },
  { id: "3", name: "YourGroop", slug: "yourgroop" },
  { id: "4", name: "Big Wedge Golf", slug: "big-wedge-golf" },
];

describe("pickOwnClient", () => {
  it("matches a name or slug exactly, ignoring case, spaces and punctuation", () => {
    expect(pickOwnClient("campfire", mine)).toEqual({ kind: "one", client: mine[1] });
    expect(pickOwnClient("Your Groop", mine)).toEqual({ kind: "one", client: mine[2] });
    expect(pickOwnClient("yourgroop", mine)).toEqual({ kind: "one", client: mine[2] });
    expect(pickOwnClient("big-wedge-golf", mine)).toEqual({ kind: "one", client: mine[3] });
  });

  it("an exact name wins over a longer one that contains it", () => {
    expect(pickOwnClient("Wedge", mine)).toEqual({ kind: "one", client: mine[0] });
  });

  it("a unique part of a name is enough; an ambiguous one asks", () => {
    expect(pickOwnClient("camp", mine)).toEqual({ kind: "one", client: mine[1] });
    expect(pickOwnClient("wed", mine)).toEqual({ kind: "several", names: ["Big Wedge Golf", "Wedge"] });
  });

  it("a client that isn't theirs is simply not found", () => {
    expect(pickOwnClient("Northwind", mine)).toEqual({ kind: "none" });
    expect(pickOwnClient("", mine)).toEqual({ kind: "none" });
  });
});
