export function buildMarkdownExport({ sessionsByUrl = {}, hintEvents = [], savedNotes = [], codeSnapshots = [] }) {
  const sessions = Object.values(sessionsByUrl).sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""));
  const lines = [
    "# CodeCoach Export",
    "",
    `Exported: ${new Date().toISOString()}`,
    "",
    "This export contains personal learning metadata and notes. It intentionally omits platform problem statements, examples, constraints, screenshots, HTML, editorials, and official solutions.",
    "",
    "## Sessions",
    ""
  ];

  if (!sessions.length) {
    lines.push("No sessions saved yet.", "");
  }

  for (const session of sessions) {
    lines.push(`### ${session.title || session.problemSlug || session.problemUrl}`);
    lines.push("");
    lines.push(`- Platform: ${platformLabel(session.platform)}`);
    lines.push(`- URL: ${session.problemUrl}`);
    lines.push(`- Status: ${session.status}`);
    lines.push(`- Hint count: ${session.hintCount || 0}`);
    lines.push(`- Review priority: ${session.reviewPriority || "low"}`);
    lines.push(`- Weakness tags: ${(session.mainWeaknessTags || []).join(", ") || "None yet"}`);
    lines.push(`- Last activity: ${session.lastActivityAt || "Unknown"}`);
    lines.push("");
  }

  lines.push("## Hint Events", "");

  if (!hintEvents.length) {
    lines.push("No hint events saved yet.", "");
  }

  for (const event of [...hintEvents].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))) {
    lines.push(`- ${event.createdAt}: level ${event.hintLevel}, ${event.hintStage}, categories: ${(event.categories || []).join(", ") || "none"}`);
  }

  lines.push("", "## Saved Notes", "");

  if (!savedNotes.length) {
    lines.push("No saved notes yet.", "");
  }

  for (const note of [...savedNotes].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))) {
    lines.push(`### ${note.title || note.problemSlug || note.problemUrl}`);
    lines.push("");
    lines.push(`- Platform: ${platformLabel(note.platform)}`);
    lines.push(`- URL: ${note.problemUrl}`);
    lines.push(`- Type: ${note.noteType}`);
    lines.push(`- Created: ${note.createdAt}`);
    lines.push(`- Next review: ${note.nextReviewAt || "Not scheduled"}`);
    lines.push(`- Hint categories: ${(note.hintCategoriesUsed || []).join(", ") || "none"}`);
    lines.push("");
    lines.push(note.personalSummary || "");
    lines.push("");

    if ((note.improvementPoints || []).length) {
      lines.push("Improvement points:");
      for (const point of note.improvementPoints) lines.push(`- ${point}`);
      lines.push("");
    }

    if ((note.learnedPatterns || []).length) {
      lines.push("Learned patterns:");
      for (const pattern of note.learnedPatterns) lines.push(`- ${pattern}`);
      lines.push("");
    }

    if (note.userCode) {
      lines.push("Saved user code:");
      lines.push("");
      lines.push("```");
      lines.push(note.userCode);
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("", "## Code History", "");

  if (!codeSnapshots.length) {
    lines.push("No code snapshots yet.", "");
  }

  for (const snapshot of [...codeSnapshots].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))) {
    lines.push(`### ${snapshot.title || snapshot.problemSlug || snapshot.problemUrl}`);
    lines.push("");
    lines.push(`- Platform: ${platformLabel(snapshot.platform)}`);
    lines.push(`- URL: ${snapshot.problemUrl}`);
    lines.push(`- Status: ${snapshot.status || "unknown"}`);
    lines.push(`- Language: ${snapshot.language || "unknown"}`);
    lines.push(`- Created: ${snapshot.createdAt}`);
    if (snapshot.note) lines.push(`- Note: ${snapshot.note}`);
    lines.push("");
    lines.push("```");
    lines.push(snapshot.code || "");
    lines.push("```");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function platformLabel(platform) {
  if (platform === "programmers") return "Programmers";
  if (platform === "leetcode") return "LeetCode";
  return "Coding platform";
}
