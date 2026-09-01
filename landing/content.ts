export type Locale = "ko" | "en";

export interface Feature {
  number: string;
  title: string;
  summary: string;
  detail: string;
}

export interface PracticeStep {
  number: string;
  title: string;
  copy: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface LandingContent {
  documentLanguage: Locale;
  skipLink: string;
  nav: {
    features: string;
    flow: string;
    faq: string;
    language: string;
    install: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    copy: string;
    install: string;
    github: string;
    facts: string[];
  };
  demo: {
    label: string;
    title: string;
    copy: string;
    videoLabel: string;
    replay: string;
    pause: string;
  };
  featuresIntro: {
    label: string;
    title: string;
    copy: string;
  };
  features: Feature[];
  practice: {
    label: string;
    title: string;
    copy: string;
  };
  practiceSteps: PracticeStep[];
  trust: {
    label: string;
    title: string;
    copy: string;
    points: string[];
  };
  faq: {
    label: string;
    title: string;
    copy: string;
  };
  faqs: FaqItem[];
  closing: {
    title: string;
    copy: string;
    install: string;
  };
  footer: {
    disclaimer: string;
    privacy: string;
    github: string;
    language: string;
  };
}

export const externalLinks = {
  store:
    "https://chromewebstore.google.com/detail/codecoach/ebbhlcklphnijoajejbpddlbdpaiphjp",
  github: "https://github.com/tkim602/CodeCoach",
  demo: "https://github.com/user-attachments/assets/5a7c556c-070c-401c-8471-b8f38aa0eabf",
} as const;

export const content: Record<Locale, LandingContent> = {
  ko: {
    documentLanguage: "ko",
    skipLink: "본문으로 바로가기",
    nav: {
      features: "기능",
      flow: "사용 방식",
      faq: "FAQ",
      language: "English",
      install: "Chrome에 추가",
    },
    hero: {
      eyebrow: "코딩테스트 연습을 위한 Chrome 확장 프로그램",
      title: "정답 대신, 다음 한 걸음만.",
      copy: "현재 작성한 코드와 실행 결과를 읽고, 지금 필요한 만큼만 힌트를 줍니다. 틀린 시도는 기록으로 남겨 같은 실수를 반복하지 않게 돕습니다.",
      install: "CodeCoach 설치",
      github: "GitHub에서 코드 보기",
      facts: ["무료로 사용", "LeetCode · 프로그래머스", "개인 OpenAI API 키 사용"],
    },
    demo: {
      label: "실제 사용 화면",
      title: "문제 페이지를 떠나지 않고, 막힌 지점만 질문합니다.",
      copy: "문제, 작성 중인 코드, 실행 결과를 한 맥락으로 읽습니다. 힌트의 구체성은 사용자가 직접 선택합니다.",
      videoLabel: "LeetCode 문제 페이지에서 CodeCoach로 힌트를 요청하는 실제 데모 영상",
      replay: "영상 다시 재생",
      pause: "영상 일시정지",
    },
    featuresIntro: {
      label: "도움이 필요한 순간",
      title: "답을 대신 쓰지 않고, 풀이가 이어지게 합니다.",
      copy: "기능을 더 많이 보여주는 대신, 한 번의 연습이 다음 문제까지 남도록 설계했습니다.",
    },
    features: [
      {
        number: "01",
        title: "단계별 힌트",
        summary: "작은 방향부터 구체적인 다음 단계까지, 공개되는 정보의 양을 직접 조절합니다.",
        detail: "가벼운 힌트로 시작하고 부족할 때만 알고리즘 방향과 구체적인 행동으로 넘어갑니다. 완성된 정답 코드를 먼저 제시하지 않습니다.",
      },
      {
        number: "02",
        title: "현재 코드 기준 리뷰",
        summary: "이미 작성한 접근 방식에서 시간복잡도, 경계 조건과 구현 오류를 짚습니다.",
        detail: "선택한 코드, 보이는 런타임 오류와 실패한 테스트 결과를 함께 읽기 때문에 일반적인 설명보다 지금 고칠 지점이 분명합니다.",
      },
      {
        number: "03",
        title: "오답 기록",
        summary: "왜 틀렸고 무엇을 바꿨는지 짧은 학습 기록으로 정리합니다.",
        detail: "실패한 제출과 수정 전후 코드를 저장해, 정답을 맞힌 뒤 사라지기 쉬운 판단 과정을 다시 확인할 수 있습니다.",
      },
      {
        number: "04",
        title: "반복되는 약점 추적",
        summary: "이분 탐색 경계, 순회 순서, off-by-one처럼 되풀이되는 실수를 모읍니다.",
        detail: "각 문제를 별개의 실패로 끝내지 않고 문제 유형, 주의점과 구현 실수 신호를 누적해 다음 연습의 우선순위를 보여줍니다.",
      },
      {
        number: "05",
        title: "복습 계획",
        summary: "틀린 문제와 어려웠던 문제를 맥락과 함께 다시 볼 수 있게 예약합니다.",
        detail: "실패한 문제는 더 높은 우선순위로 남기고, 완료·연기·삭제 상태를 직접 관리해 같은 실수를 줄이는 복습 흐름을 만듭니다.",
      },
    ],
    practice: {
      label: "연습 흐름",
      title: "풀이의 핵심은 끝까지 내가 합니다.",
      copy: "CodeCoach는 문제 풀이를 가로채지 않습니다. 시도하고, 필요한 만큼 묻고, 배운 내용을 다음 연습으로 넘기는 과정만 연결합니다.",
    },
    practiceSteps: [
      { number: "01", title: "문제를 엽니다", copy: "LeetCode나 프로그래머스를 평소처럼 사용합니다." },
      { number: "02", title: "먼저 직접 풉니다", copy: "현재 코드와 실행 결과가 질문의 맥락이 됩니다." },
      { number: "03", title: "작은 힌트부터 봅니다", copy: "정말 부족할 때만 더 구체적인 단계로 넘어갑니다." },
      { number: "04", title: "배운 내용을 남깁니다", copy: "오답, 약점과 복습 항목을 다음 연습에 다시 씁니다." },
    ],
    trust: {
      label: "Local-first",
      title: "학습 기록과 API 키는 기본적으로 브라우저에 남습니다.",
      copy: "CodeCoach가 운영하는 AI 프록시 서버는 없습니다. 사용자의 OpenAI API 키로 확장 프로그램에서 OpenAI에 직접 요청하며, 저장한 코드와 오답 기록은 로컬에 보관합니다.",
      points: ["OpenAI 요청은 store: false로 전송", "클라우드 동기화는 기본값이 꺼짐", "코드 스냅샷과 오답 본문은 로컬 보관"],
    },
    faq: {
      label: "설치 전에",
      title: "자주 묻는 질문",
      copy: "사용 범위와 데이터 처리 방식부터 확인해보세요.",
    },
    faqs: [
      { question: "LeetCode 정답 코드를 바로 보여주나요?", answer: "아니요. 기본 흐름은 작은 힌트에서 시작해 필요한 경우에만 더 구체적인 도움으로 넘어갑니다. 완성된 정답 코드를 먼저 제공하지 않습니다." },
      { question: "프로그래머스에서도 사용할 수 있나요?", answer: "네. CodeCoach는 LeetCode와 프로그래머스의 문제 페이지를 지원하며, 각 사이트의 편집기와 실행 결과를 같은 내부 맥락으로 정리합니다." },
      { question: "OpenAI API 키가 필요한가요?", answer: "AI 코칭 기능에는 개인 OpenAI API 키가 필요합니다. 키는 브라우저에 로컬로 저장되고, 요청은 OpenAI로 직접 전송됩니다." },
      { question: "실제 코딩테스트나 채용 시험에서 사용해도 되나요?", answer: "아니요. CodeCoach는 연습용 도구입니다. 진행 중인 대회, 자격시험, 채용 평가, 비공개 시험과 같은 평가 환경에서는 도움을 제공하지 않습니다." },
    ],
    closing: {
      title: "다음 문제에서는 정답 검색 전에, 힌트 하나만 받아보세요.",
      copy: "막힌 지점은 넘되, 해결하는 경험은 온전히 남길 수 있습니다.",
      install: "Chrome에 CodeCoach 추가",
    },
    footer: {
      disclaimer: "CodeCoach는 LeetCode, Programmers, OpenAI, Google과 제휴 관계가 없는 독립 프로젝트입니다.",
      privacy: "개인정보처리방침",
      github: "GitHub",
      language: "English",
    },
  },
  en: {
    documentLanguage: "en",
    skipLink: "Skip to main content",
    nav: {
      features: "Features",
      flow: "How it works",
      faq: "FAQ",
      language: "한국어",
      install: "Add to Chrome",
    },
    hero: {
      eyebrow: "A Chrome extension for coding interview practice",
      title: "The next step, not the answer.",
      copy: "CodeCoach reads the code and run result already on your screen, then gives only the amount of help you ask for. Failed attempts become notes you can actually use again.",
      install: "Install CodeCoach",
      github: "View the code on GitHub",
      facts: ["Free to use", "LeetCode · Programmers", "Bring your own OpenAI API key"],
    },
    demo: {
      label: "Real product",
      title: "Ask about the exact point where you got stuck—without leaving the problem page.",
      copy: "CodeCoach reads the problem, your current code, and visible run result as one context. You decide how specific each hint should be.",
      videoLabel: "A real CodeCoach demo requesting a hint beside a LeetCode problem",
      replay: "Replay demo",
      pause: "Pause demo",
    },
    featuresIntro: {
      label: "When you need help",
      title: "Keep the solution yours and the practice moving.",
      copy: "Each feature is designed to make one attempt useful beyond the moment you finally get accepted.",
    },
    features: [
      { number: "01", title: "Progressive hints", summary: "Control how much gets revealed, from a small nudge to one concrete next step.", detail: "Start light, then move to an algorithm direction or a specific action only when you need it. A complete accepted solution is not the default response." },
      { number: "02", title: "Review your current code", summary: "Find complexity issues, edge cases, and implementation mistakes in the approach you already wrote.", detail: "Selected code, visible runtime errors, and failed test output stay in the same context, so the feedback can point to the decision that matters now." },
      { number: "03", title: "Wrong-answer notes", summary: "Turn what failed and what changed into a short, reusable study record.", detail: "Failed submissions and before-and-after snapshots keep the reasoning that usually disappears once the solution is accepted." },
      { number: "04", title: "Recurring weakness signals", summary: "Collect repeated mistakes such as binary-search boundaries, traversal order, and off-by-one errors.", detail: "Problem type, caution points, and implementation slips accumulate across sessions instead of leaving every failed problem disconnected." },
      { number: "05", title: "Review planning", summary: "Bring difficult problems back with their original context when it is time to review.", detail: "Failed attempts receive higher priority, while completion, postponement, and removal stay under your control." },
    ],
    practice: {
      label: "Practice flow",
      title: "The important part of the solution stays yours.",
      copy: "CodeCoach does not take over the problem. It connects the steps between trying, asking for just enough help, and carrying the lesson forward.",
    },
    practiceSteps: [
      { number: "01", title: "Open a problem", copy: "Use LeetCode or Programmers as you normally would." },
      { number: "02", title: "Try it yourself first", copy: "Your current code and run result become the context." },
      { number: "03", title: "Start with less help", copy: "Move to a more specific hint only when you need it." },
      { number: "04", title: "Keep the lesson", copy: "Reuse notes, weakness signals, and review items later." },
    ],
    trust: {
      label: "Local-first",
      title: "Your API key and practice records stay in your browser by default.",
      copy: "CodeCoach does not run an AI proxy. Requests go directly from the extension to OpenAI with your own key, while saved code and wrong-answer notes remain local.",
      points: ["OpenAI requests use store: false", "Cloud sync is off by default", "Code snapshots and note bodies stay local"],
    },
    faq: {
      label: "Before installing",
      title: "Frequently asked questions",
      copy: "Check the scope and data model before adding the extension.",
    },
    faqs: [
      { question: "Does CodeCoach give full LeetCode solutions?", answer: "No. The default flow starts with a small hint and becomes more specific only when you ask. It does not lead with complete accepted code." },
      { question: "Does it work on Programmers?", answer: "Yes. CodeCoach supports LeetCode and Programmers problem pages and normalizes their editor and run-result context." },
      { question: "Do I need an OpenAI API key?", answer: "Yes for AI coaching features. Your key is stored locally in the browser and requests are sent directly to OpenAI." },
      { question: "Can I use it during a live assessment?", answer: "No. CodeCoach is a practice tool and disables assistance for contests, certifications, hiring tests, private assessments, and similar evaluation settings." },
    ],
    closing: {
      title: "Try one hint before you search for the answer.",
      copy: "Get past the stuck point without giving up the experience of solving it yourself.",
      install: "Add CodeCoach to Chrome",
    },
    footer: {
      disclaimer: "CodeCoach is an independent project and is not affiliated with LeetCode, Programmers, OpenAI, or Google.",
      privacy: "Privacy",
      github: "GitHub",
      language: "한국어",
    },
  },
};

export function getLocaleFromPath(pathname: string): Locale {
  return /(^|\/)ko(\/|$)/.test(pathname) ? "ko" : "en";
}
