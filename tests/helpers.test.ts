import { describe, it, expect } from "vitest";
import { slugify, remoteToPagesUrl, projectNameFromCwd } from "../extensions/helpers.js";

describe("slugify", () => {
  it("converts title to lowercase slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces special chars with hyphens", () => {
    expect(slugify("Deploy failures by service!")).toBe("deploy-failures-by-service");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("foo   bar--baz")).toBe("foo-bar-baz");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("truncates to 60 chars", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(60);
  });

  it("falls back to 'artifact' for empty result", () => {
    expect(slugify("!!!")).toBe("artifact");
  });
});

describe("projectNameFromCwd", () => {
  it("generates stable name from cwd path", () => {
    const name = projectNameFromCwd("/Users/me/projects/my-app");
    expect(name).toBe("pi-artifacts-Users-me-projects-my-app");
  });

  it("replaces special chars with hyphens", () => {
    const name = projectNameFromCwd("/home/user/my_project");
    expect(name).toBe("pi-artifacts-home-user-my-project");
  });

  it("truncates to 40 chars plus prefix", () => {
    const long = "/a/" + "x".repeat(100);
    const name = projectNameFromCwd(long);
    expect(name.length).toBeLessThanOrEqual(55); // "pi-artifacts-" (13) + 40 + slashes
  });
});

describe("remoteToPagesUrl", () => {
  it("parses SSH remote for project page", () => {
    expect(remoteToPagesUrl("git@github.com:user/my-repo.git")).toBe(
      "https://user.github.io/my-repo/"
    );
  });

  it("parses HTTPS remote for project page", () => {
    expect(remoteToPagesUrl("https://github.com/user/my-repo.git")).toBe(
      "https://user.github.io/my-repo/"
    );
  });

  it("parses remote without .git suffix", () => {
    expect(remoteToPagesUrl("git@github.com:user/my-repo")).toBe(
      "https://user.github.io/my-repo/"
    );
  });

  it("detects user page (username.github.io repo)", () => {
    expect(remoteToPagesUrl("git@github.com:sam/sam.github.io.git")).toBe(
      "https://sam.github.io/"
    );
  });

  it("returns fallback for unknown remote", () => {
    expect(remoteToPagesUrl("git@gitlab.com:user/repo.git")).toBe(
      "https://pages.github.com/ (unknown remote)"
    );
  });
});
