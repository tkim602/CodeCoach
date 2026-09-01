import { content, externalLinks, getLocaleFromPath } from "./content";

describe("landing content", () => {
  it("selects Korean only for the Korean route", () => {
    expect(getLocaleFromPath("/CodeCoach/ko/")).toBe("ko");
    expect(getLocaleFromPath("/ko/")).toBe("ko");
    expect(getLocaleFromPath("/CodeCoach/")).toBe("en");
  });

  it.each(["ko", "en"] as const)("provides the complete %s product story", (locale) => {
    expect(content[locale].features).toHaveLength(5);
    expect(content[locale].practiceSteps).toHaveLength(4);
    expect(content[locale].faqs).toHaveLength(4);
    expect(content[locale].hero.title).toBeTruthy();
  });

  it("keeps the published product destinations unchanged", () => {
    expect(externalLinks.store).toBe(
      "https://chromewebstore.google.com/detail/codecoach/ebbhlcklphnijoajejbpddlbdpaiphjp",
    );
    expect(externalLinks.github).toBe("https://github.com/tkim602/CodeCoach");
    expect(externalLinks.demo).toBe(
      "https://github.com/user-attachments/assets/5a7c556c-070c-401c-8471-b8f38aa0eabf",
    );
  });
});
