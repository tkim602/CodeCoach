export function clip(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...`;
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function filenameSafe(value) {
  return String(value || "coding-note")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "coding-note";
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = hours > 0 ? [hours, minutes, seconds] : [minutes, seconds];
  return parts.map((value) => String(value).padStart(2, "0")).join(":");
}

export function platformLabel(platform) {
  if (platform === "programmers") return "Programmers";
  if (platform === "leetcode") return "LeetCode";
  return "Practice";
}

export function snapshotStatusLabel(status, language = "ko") {
  const labels = language === "ko"
    ? { failed: "오답", passed: "정답" }
    : { failed: "Wrong Answer", passed: "Accepted" };
  return labels[status] || "";
}

export function statusIcon(status, labels = {}) {
  if (status === "passed") return labels.passed || "";
  if (status === "failed") return labels.failed || "";
  return "";
}

export function formatSnapshotTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

export function formatLanguageName(value) {
  const text = String(value || "").trim();
  if (!text) return "Unknown";
  // CodeMirror mode IDs use MIME-like prefixes (e.g. "text/x-python", "text/x-c++src").
  // Strip them so the label lookup hits the canonical key.
  const stripped = text
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^text\/x-?/, "")
    .replace(/src$/, "");
  const labels = languageLabels();
  if (labels[stripped]) return labels[stripped];
  return stripped
    .split(/[-_\s/]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function extensionForLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  const extensions = {
    py: "py",
    python: "py",
    python3: "py",
    js: "js",
    javascript: "js",
    ts: "ts",
    typescript: "ts",
    cpp: "cpp",
    "c++": "cpp",
    c: "c",
    csharp: "cs",
    "c#": "cs",
    java: "java",
    kotlin: "kt",
    swift: "swift",
    go: "go",
    golang: "go",
    ruby: "rb",
    php: "php",
    rust: "rs",
    scala: "scala",
    dart: "dart",
    elixir: "ex",
    erlang: "erl",
    racket: "rkt",
    mysql: "sql",
    sql: "sql"
  };
  return extensions[normalized] || "txt";
}

export function categoryLabel(category, labels = {}, language = "ko") {
  return labels[category]?.[language] || humanizeCategory(category, language);
}

export function humanizeCategory(category, language = "ko") {
  const text = String(category || "").replaceAll("_", " ").trim();
  if (!text) return language === "ko" ? "기타" : "Other";
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function languageLabels() {
  return {
    py: "Python",
    python: "Python",
    python3: "Python 3",
    js: "JavaScript",
    javascript: "JavaScript",
    ts: "TypeScript",
    typescript: "TypeScript",
    cpp: "C++",
    "c++": "C++",
    c: "C",
    csharp: "C#",
    "c#": "C#",
    java: "Java",
    kotlin: "Kotlin",
    swift: "Swift",
    go: "Go",
    golang: "Go",
    ruby: "Ruby",
    php: "PHP",
    rust: "Rust",
    scala: "Scala",
    dart: "Dart",
    elixir: "Elixir",
    erlang: "Erlang",
    racket: "Racket",
    mysql: "MySQL",
    sql: "SQL"
  };
}
