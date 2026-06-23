export function groupLearningDataByProblem({ snapshots = [], notes = [], problemMetadata = {}, hintEvents = [], includeMetadataOnly = true } = {}) {
  const groups = new Map();
  const hintCounts = new Map();
  for (const event of hintEvents || []) {
    const key = historyGroupKey(event);
    if (!key) continue;
    hintCounts.set(key, (hintCounts.get(key) || 0) + 1);
  }
  const ensureGroup = (item) => {
    const key = historyGroupKey(item);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: item.title || item.problemSlug || "Practice problem",
        platform: item.platform || "practice",
        lastActivityAt: item.createdAt || "",
        items: [],
        notes: []
      });
    }
    return groups.get(key);
  };

  for (const snapshot of snapshots) {
    const group = ensureGroup(snapshot);
    group.items.push(snapshot);
    if ((snapshot.createdAt || "") > group.lastActivityAt) {
      group.lastActivityAt = snapshot.createdAt || "";
      group.title = snapshot.title || group.title;
      group.platform = snapshot.platform || group.platform;
    }
  }
  for (const note of notes) {
    if (note.noteType === "manual") continue;
    const group = ensureGroup(note);
    group.notes.push(note);
    if ((note.createdAt || "") > group.lastActivityAt) {
      group.lastActivityAt = note.createdAt || "";
      group.title = note.title || group.title;
      group.platform = note.platform || group.platform;
    }
  }
  if (includeMetadataOnly) {
    // Include metadata-only groups for review planner entries.
    for (const [key, meta] of Object.entries(problemMetadata)) {
      if (groups.has(key)) continue;
      if (!Array.isArray(meta.reviewSchedule) || !meta.reviewSchedule.length) continue;
      const title = meta.titleOverride || key.replace(/^(custom|manual):/, "").replace(/-/g, " ") || "Practice problem";
      const platform = meta.source || (key.startsWith("manual:") ? "direct" : key.startsWith("custom:") ? "direct" : (key.split(":")[0] || "practice"));
      groups.set(key, {
        key,
        title,
        platform,
        lastActivityAt: meta.updatedAt || "",
        items: [],
        notes: []
      });
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      title: problemMetadata[group.key]?.titleOverride || group.title,
      bookmarked: Boolean(problemMetadata[group.key]?.bookmarked),
      metadata: problemMetadata[group.key] || {},
      hintCount: hintCounts.get(group.key) || 0,
      items: group.items.sort(sortByCreatedAt),
      notes: group.notes.sort(sortByCreatedAt),
      status: groupStatus(group)
    }))
    .sort(sortByRecentActivity);
}

export function applyHistoryFilters(groups, { query = "", platform = "all", status = "all", sort = "recent" } = {}) {
  const normalizedQuery = normalizeSearch(query);
  const filtered = groups.filter((group) => {
    if (platform !== "all" && group.platform !== platform) return false;
    if (status === "bookmarked" && !group.bookmarked) return false;
    if (!["all", "bookmarked"].includes(status) && group.status !== status) return false;
    if (normalizedQuery && !historyGroupMatchesQuery(group, normalizedQuery)) return false;
    return true;
  });

  if (sort === "bookmarked") {
    return filtered.sort((a, b) => Number(b.bookmarked) - Number(a.bookmarked) || sortByRecentActivity(a, b));
  }
  if (sort === "title") {
    return filtered.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  }
  if (sort === "status") {
    return filtered.sort((a, b) => statusRank(b.status) - statusRank(a.status) || sortByRecentActivity(a, b));
  }
  return filtered.sort(sortByRecentActivity);
}

export function hasComparableSnapshots(group) {
  return Boolean(comparableSnapshotPair(group));
}

export function comparableSnapshotPair(group) {
  const items = [...(group.items || [])].sort(sortByCreatedAt);
  const passed = items.find((item) => item.status === "passed" && item.code);
  if (!passed) return null;
  const failed = items.find((item) =>
    item.status === "failed" &&
    item.code &&
    (!passed.createdAt || !item.createdAt || item.createdAt <= passed.createdAt)
  ) || items.find((item) => item.status === "failed" && item.code);
  return failed ? { failed, passed } : null;
}

export function historyGroupKey(item) {
  const platform = item.platform || "";
  const problemUrl = item.problemUrl || "";
  if (platform === "leetcode") {
    const slug = item.problemSlug || leetcodeSlugFromUrl(problemUrl);
    if (slug) return `leetcode:${slug}`;
  }
  if (platform === "programmers") {
    const lesson = programmersLessonFromUrl(problemUrl) || item.problemSlug;
    if (lesson) return `programmers:${lesson}`;
  }
  return problemUrl || item.sessionId || item.id;
}

export function leetcodeSlugFromUrl(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.toLowerCase().split("/").filter(Boolean);
    return parts[0] === "problems" ? parts[1] || "" : "";
  } catch {
    const match = String(value || "").match(/\/problems\/([^/]+)/i);
    return match?.[1]?.toLowerCase() || "";
  }
}

export function programmersLessonFromUrl(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/learn\/courses\/(\d+)\/lessons\/(\d+)/);
    return match ? `${match[1]}-${match[2]}` : "";
  } catch {
    const match = String(value || "").match(/\/learn\/courses\/(\d+)\/lessons\/(\d+)/);
    return match ? `${match[1]}-${match[2]}` : "";
  }
}

export function groupStatus(group) {
  if ((group.items || []).some((item) => item.status === "passed")) return "passed";
  if ((group.items || []).some((item) => item.status === "failed")) return "failed";
  return "";
}

export function nextReviewAtForGroup(group) {
  const schedule = group.metadata?.reviewSchedule;
  if (Array.isArray(schedule) && schedule.length > 0) {
    const earliest = schedule
      .filter((e) => !e.completedAt)
      .map((e) => e.date)
      .sort()[0];
    return earliest ? new Date(earliest + "T00:00:00").toISOString() : "";
  }
  if (group.metadata?.nextReviewAt) return group.metadata.nextReviewAt;
  if (group.metadata?.lastReviewedAt && !group.metadata?.nextReviewAt) return "";
  const latestFailed = (group.items || []).find((item) => item.status === "failed");
  const latestPassed = (group.items || []).find((item) => item.status === "passed");
  const base = latestFailed || latestPassed || group.notes?.[0];
  if (!base?.createdAt) return "";
  const date = new Date(base.createdAt);
  if (latestFailed && (!latestPassed || (latestFailed.createdAt || "") > (latestPassed.createdAt || ""))) {
    date.setDate(date.getDate() + 1);
  } else if ((group.hintCount || 0) >= 2) {
    date.setDate(date.getDate() + 3);
  } else {
    date.setDate(date.getDate() + 7);
  }
  return date.toISOString();
}

export function historyGroupMatchesQuery(group, query) {
  return [
    group.title,
    group.key,
    group.platform,
    ...(group.items || []).flatMap((item) => [item.title, item.problemSlug, item.problemUrl]),
    ...(group.notes || []).flatMap((item) => [item.title, item.problemSlug, item.problemUrl])
  ].some((value) => normalizeSearch(value).includes(query));
}

export function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

export function sortByCreatedAt(a, b) {
  return (b.createdAt || "").localeCompare(a.createdAt || "");
}

export function sortByRecentActivity(a, b) {
  return (b.lastActivityAt || "").localeCompare(a.lastActivityAt || "");
}

function statusRank(status) {
  if (status === "passed") return 3;
  if (status === "failed") return 2;
  return 0;
}
