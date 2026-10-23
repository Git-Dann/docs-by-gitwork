import { describe, expect, it } from "vitest";
import { answersAsApi } from "../api-target";

describe("answersAsApi", () => {
  it("treats a GraphQL endpoint as an API even when a bare GET returns no body (204)", () => {
    expect(answersAsApi("https://countries.trevorblades.com/graphql", null)).toBe(true);
    expect(answersAsApi("https://api.example.com/v1/graphql/", "text/html")).toBe(true);
  });
  it("still treats JSON responses as an API, including +json and GraphQL's own media type", () => {
    expect(answersAsApi("https://api.github.com", "application/json; charset=utf-8")).toBe(true);
    expect(answersAsApi("https://x.test", "application/problem+json")).toBe(true);
    expect(answersAsApi("https://x.test", "application/graphql-response+json")).toBe(true);
  });
  it("does not call a website an API because of a word in its path", () => {
    expect(answersAsApi("https://example.com/", "text/html")).toBe(false);
    expect(answersAsApi("https://blog.example.com/posts/why-graphql-is-great", "text/html")).toBe(false);
    expect(answersAsApi("https://example.com/graphql-tutorial", "text/html")).toBe(false);
  });
});
