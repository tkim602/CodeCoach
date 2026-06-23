const BLOCKED_PREFIXES = [
  "/contest",
  "/assessment",
  "/interview",
  "/explore",
  "/discuss"
];

const BLOCKED_PROBLEM_SECTIONS = new Set([
  "editorial",
  "solutions",
  "solution"
]);

const PROGRAMMERS_HOSTS = new Set([
  "school.programmers.co.kr",
  "programmers.co.kr",
  "www.programmers.co.kr"
]);

const PROGRAMMERS_BLOCKED_PREFIXES = [
  "/competitions",
  "/skill_checks",
  "/assignments",
  "/certifications",
  "/job_positions",
  "/career",
  "/pr",
  "/users",
  "/learn/challenges"
];

export function normalizeLeetCodeUrl(rawUrl) {
  return normalizePracticeUrl(rawUrl);
}

export function normalizePracticeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.search = "";
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return rawUrl || "";
  }
}

export function evaluateCodingPracticePage(rawUrl, signals = {}) {
  if (!rawUrl) {
    return blocked("No active page detected.");
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return blocked("The active page URL is not valid.");
  }

  if (url.hostname === "leetcode.com" || url.hostname === "www.leetcode.com") {
    return evaluateLeetCodePage(rawUrl, signals);
  }

  if (PROGRAMMERS_HOSTS.has(url.hostname)) {
    return evaluateProgrammersPage(rawUrl, signals);
  }

  return blocked("This is not a supported coding-practice platform.");
}

export function evaluateLeetCodePage(rawUrl, signals = {}) {
  if (!rawUrl) {
    return blocked("No active page detected.");
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return blocked("The active page URL is not valid.");
  }

  if (url.hostname !== "leetcode.com" && url.hostname !== "www.leetcode.com") {
    return blocked("This is not a LeetCode page.");
  }

  const pathname = normalizePath(url.pathname);
  const lowerPath = pathname.toLowerCase();

  if (BLOCKED_PREFIXES.some((prefix) => lowerPath === prefix || lowerPath.startsWith(`${prefix}/`))) {
    return blocked("This page is a contest, assessment, interview, explore, or discuss route.");
  }

  if (!lowerPath.startsWith("/problems/")) {
    return blocked("This is not a normal practice problem route.");
  }

  const parts = lowerPath.split("/").filter(Boolean);
  const slug = parts[1];
  const section = parts[2] || "";

  if (!slug) {
    return blocked("No problem slug was detected.");
  }

  if (BLOCKED_PROBLEM_SECTIONS.has(section)) {
    return blocked("AI hints are disabled on editorials and official solution pages.");
  }

  if (section && !["description", "submissions", "submissions-detail"].includes(section)) {
    return blocked("This problem subpage is not recognized as a normal practice page.");
  }

  if (signals.officialContentVisible) {
    return blocked("Official solution or editorial content appears to be visible.");
  }

  return {
    allowed: true,
    status: "allowed",
    platform: "leetcode",
    platformName: "LeetCode",
    reason: "LeetCode practice page detected.",
    problemSlug: slug,
    problemId: slug,
    problemUrl: `https://${url.hostname}/problems/${slug}`
  };
}

export function evaluateProgrammersPage(rawUrl, signals = {}) {
  if (!rawUrl) {
    return blocked("No active page detected.");
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return blocked("The active page URL is not valid.");
  }

  if (!PROGRAMMERS_HOSTS.has(url.hostname)) {
    return blocked("This is not a Programmers page.");
  }

  const pathname = normalizePath(url.pathname);
  const lowerPath = pathname.toLowerCase();

  if (PROGRAMMERS_BLOCKED_PREFIXES.some((prefix) => lowerPath === prefix || lowerPath.startsWith(`${prefix}/`))) {
    return blocked("This Programmers page is not a normal practice lesson route.");
  }

  const lessonMatch = pathname.match(/^\/learn\/courses\/(\d+)\/lessons\/(\d+)(?:\/)?$/);
  if (!lessonMatch) {
    return blocked("This is not a recognized Programmers practice lesson page.");
  }

  if (signals.premiumLocked || signals.paidLocked) {
    return blocked("This appears to be locked paid or premium content.");
  }

  if (signals.privateAssessment) {
    return blocked("This appears to be a private test, skill check, certification, or assessment page.");
  }

  const [, courseId, lessonId] = lessonMatch;

  return {
    allowed: true,
    status: "allowed",
    platform: "programmers",
    platformName: "Programmers",
    reason: "Programmers practice lesson detected.",
    problemSlug: `${courseId}-${lessonId}`,
    problemId: lessonId,
    courseId,
    lessonId,
    problemUrl: normalizePracticeUrl(url.toString())
  };
}

function normalizePath(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function blocked(reason) {
  return {
    allowed: false,
    status: "blocked",
    platform: "",
    platformName: "",
    reason,
    problemSlug: "",
    problemId: "",
    problemUrl: ""
  };
}
