import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { externalLinks } from "./content";

describe("CodeCoach landing page", () => {
  it("shows the primary Korean product path and destinations", () => {
    render(<App locale="ko" />);

    expect(screen.getByRole("heading", { level: 1, name: "정답 대신, 다음 한 걸음만." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CodeCoach 설치" })).toHaveAttribute("href", externalLinks.store);
    expect(screen.getByRole("link", { name: "GitHub에서 코드 보기" })).toHaveAttribute("href", externalLinks.github);
    expect(screen.getAllByRole("link", { name: "English" })).toHaveLength(2);
    screen.getAllByRole("link", { name: "English" }).forEach((link) => {
      expect(link).toHaveAttribute("href", "/CodeCoach/");
    });
    expect(screen.getByLabelText("LeetCode 문제 페이지에서 CodeCoach로 힌트를 요청하는 실제 데모 영상")).toHaveAttribute(
      "poster",
      "/CodeCoach/codecoach-demo-poster.png",
    );
    expect(screen.getByRole("heading", { name: "단계별 힌트" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "복습 계획" })).toBeInTheDocument();
  });

  it("reveals one FAQ answer without opening the others", async () => {
    const user = userEvent.setup();
    render(<App locale="ko" />);

    const firstQuestion = screen.getByRole("button", { name: "LeetCode 정답 코드를 바로 보여주나요?" });
    const secondQuestion = screen.getByRole("button", { name: "프로그래머스에서도 사용할 수 있나요?" });

    expect(firstQuestion).toHaveAttribute("aria-expanded", "false");
    expect(secondQuestion).toHaveAttribute("aria-expanded", "false");

    await user.click(firstQuestion);

    expect(firstQuestion).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/완성된 정답 코드를 먼저 제공하지 않습니다/)).toBeVisible();
    expect(secondQuestion).toHaveAttribute("aria-expanded", "false");
  });

  it("uses the root language route from English", () => {
    render(<App locale="en" />);

    expect(screen.getAllByRole("link", { name: "한국어" })).toHaveLength(2);
    screen.getAllByRole("link", { name: "한국어" }).forEach((link) => {
      expect(link).toHaveAttribute("href", "/CodeCoach/ko/");
    });
    expect(screen.getByRole("heading", { level: 1, name: "The next step, not the answer." })).toBeInTheDocument();
  });

  it("does not autoplay the demo when reduced motion is requested", () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });

    render(<App locale="ko" />);

    expect(screen.getByLabelText("LeetCode 문제 페이지에서 CodeCoach로 힌트를 요청하는 실제 데모 영상")).not.toHaveAttribute(
      "autoplay",
    );

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
  });
});
