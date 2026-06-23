export function analyzeCodeQuickly({ code = "", language = "" }) {
  const normalizedLanguage = language.toLowerCase();
  const checks = [];

  if (!code.trim()) {
    return [
      {
        type: "approach_selection",
        message: "No code is detected yet. Start by writing the brute-force idea, then look for repeated work you can avoid.",
        confidence: "medium"
      }
    ];
  }

  if (normalizedLanguage.includes("python") || looksLikePython(code)) {
    checks.push(...analyzePython(code));
  }

  if (normalizedLanguage.includes("javascript") || normalizedLanguage.includes("typescript") || looksLikeJavaScript(code)) {
    checks.push(...analyzeJavaScript(code));
  }

  checks.push(...analyzeCommon(code));

  return dedupeChecks(checks).slice(0, 5);
}

function analyzePython(code) {
  const checks = [];

  if (/\breturn\s+[\w.\[\]()"']+\.sort\(\)/.test(code) || /^\s*\w+\s*=\s*[\w.\[\]()"']+\.sort\(\)/m.test(code)) {
    checks.push({
      type: "python_api_usage",
      message: "Python list.sort() mutates the list and returns None. If you need a sorted value, check whether sorted(...) is intended.",
      confidence: "high"
    });
  }

  if (/\bheapq\./.test(code) && !/\bimport\s+heapq\b/.test(code) && !/\bfrom\s+heapq\s+import\b/.test(code)) {
    checks.push({
      type: "runtime_error",
      message: "heapq is used but no heapq import is detected.",
      confidence: "high"
    });
  }

  if (/for\s+\w+\s+in\s+range\([^)]*len\([^)]*\)[^)]*\):[\s\S]*for\s+\w+\s+in\s+range\(/.test(code)) {
    checks.push({
      type: "time_complexity",
      message: "Nested loops are present. If this times out, look for a set, dict, two-pointer, or sorting pattern that removes repeated scanning.",
      confidence: "medium"
    });
  }

  if (/\.append\([^)]*\)\s*==/.test(code)) {
    checks.push({
      type: "python_api_usage",
      message: "list.append(...) returns None. A comparison using append(...) is probably not checking the value you expect.",
      confidence: "high"
    });
  }

  return checks;
}

function analyzeJavaScript(code) {
  const checks = [];

  if (/\.sort\(\s*\)/.test(code)) {
    checks.push({
      type: "javascript_api_usage",
      message: "JavaScript Array.sort() sorts lexicographically by default. Numeric sorting usually needs a comparator.",
      confidence: "high"
    });
  }

  if (/for\s*\([^)]*<=\s*[^)]*\.length/.test(code)) {
    checks.push({
      type: "off_by_one",
      message: "A loop condition uses <= with .length. Check whether the final index becomes out of bounds.",
      confidence: "medium"
    });
  }

  if (/new\s+Map\(/.test(code) || /new\s+Set\(/.test(code)) {
    checks.push({
      type: "data_structure_selection",
      message: "A hash-based container is present. Check whether keys are added before or after the lookup based on duplicate-index rules.",
      confidence: "low"
    });
  }

  return checks;
}

function analyzeCommon(code) {
  const checks = [];

  if (/for\s+.*for\s+|for\s*\([^)]*\)\s*{[\s\S]*for\s*\(/.test(code) && /\bin\b|\.includes\(|indexOf\(/.test(code)) {
    checks.push({
      type: "time_complexity",
      message: "There is repeated membership-style checking. If lookup speed matters, compare list or array lookup with a hash-based container.",
      confidence: "medium"
    });
  }

  if (/\bvisited\b[\s\S]{0,200}\b(queue|deque|stack)\b/i.test(code)) {
    checks.push({
      type: "visited_timing",
      message: "For BFS or DFS, check whether nodes are marked visited when enqueued or only after they are popped.",
      confidence: "low"
    });
  }

  return checks;
}

function looksLikePython(code) {
  return /\bdef\s+\w+\(|\bself\b|:\s*(\n|$)/.test(code);
}

function looksLikeJavaScript(code) {
  return /\bfunction\s+\w+\(|=>|const\s+|let\s+/.test(code);
}

function dedupeChecks(checks) {
  const seen = new Set();
  return checks.filter((check) => {
    const key = `${check.type}:${check.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
