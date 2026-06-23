import { PROBLEM_TYPE_TAGS } from "./problemTypes.js";
import { CAUTION_POINT_TAGS } from "./cautionPoints.js";
import { IMPLEMENTATION_HINT_TAGS } from "./implementationHints.js";
import { HINT_CATEGORY_LABELS } from "../constants.js";

export { PROBLEM_TYPE_TAGS, CAUTION_POINT_TAGS, IMPLEMENTATION_HINT_TAGS };

export const PROBLEM_TYPE_TAG_IDS = PROBLEM_TYPE_TAGS.map((tag) => tag.id);
export const CAUTION_POINT_TAG_IDS = CAUTION_POINT_TAGS.map((tag) => tag.id);
export const IMPLEMENTATION_HINT_TAG_IDS = IMPLEMENTATION_HINT_TAGS.map((tag) => tag.id);

const TAGS_BY_AXIS = {
  problem: PROBLEM_TYPE_TAGS,
  caution: CAUTION_POINT_TAGS,
  implementation: IMPLEMENTATION_HINT_TAGS
};

const IDS_BY_AXIS = {
  problem: new Set(PROBLEM_TYPE_TAG_IDS),
  caution: new Set(CAUTION_POINT_TAG_IDS),
  implementation: new Set(IMPLEMENTATION_HINT_TAG_IDS)
};

const TAXONOMY_LIMITS = {
  problem: 2,
  caution: 2,
  implementation: 2
};

const LEGACY_TO_PROBLEM = {
  hashmap_usage: "hash_table",
  hash_map: "hash_table",
  hashmap: "hash_table",
  hash_set: "set",
  heap_usage: "heap",
  queue_usage: "queue",
  stack_usage: "stack",
  sorting: "sorting",
  two_pointer: "two_pointers",
  sliding_window: "sliding_window",
  binary_search: "binary_search",
  bfs: "bfs",
  dfs: "dfs",
  graph_bfs: "bfs",
  graph_dfs: "dfs",
  tree_traversal: "dfs",
  dp: "dynamic_programming",
  dp_state_definition: "dynamic_programming",
  dp_transition: "dynamic_programming",
  dp_initialization: "dynamic_programming",
  greedy_choice: "greedy",
  bitwise_operation: "bit_manipulation",
  bit_manipulation: "bit_manipulation",
  math_formula: "math",
  linked_list_node: "linked_list",
  graph_traversal: "graph_traversal",
  priority_queue: "priority_queue",
  recursion_base_case: "recursion",
  recursion_depth: "recursion"
};

const PROBLEM_ALIAS_LABELS = {
  math_sequences: { ko: "수학/수열", en: "Math sequences" },
  sequence: { ko: "수열", en: "Sequence" },
  sequences: { ko: "수열", en: "Sequences" },
  pattern_recognition: { ko: "패턴 찾기", en: "Pattern recognition" },
  arithmetic_sequence: { ko: "등차수열", en: "Arithmetic sequence" },
  geometric_sequence: { ko: "등비수열", en: "Geometric sequence" }
};

const PROBLEM_ALIASES = {
  "hash map": "hash_table",
  "hashmap": "hash_table",
  "hashmaps": "hash_table",
  "hash table": "hash_table",
  "hash tables": "hash_table",
  "dictionary": "hash_table",
  "dict": "hash_table",
  "two pointer": "two_pointers",
  "two pointers": "two_pointers",
  "two-pointer": "two_pointers",
  "sliding window": "sliding_window",
  "binary search": "binary_search",
  "prefix sums": "prefix_sum",
  "prefix sum": "prefix_sum",
  "math sequences": "math_sequences",
  "math sequence": "math_sequences",
  "number sequence": "math_sequences",
  "number sequences": "math_sequences",
  "sequence": "sequence",
  "sequences": "sequences",
  "arithmetic sequence": "arithmetic_sequence",
  "geometric sequence": "geometric_sequence",
  "pattern recognition": "pattern_recognition",
  "dynamic programming": "dynamic_programming",
  "dp": "dynamic_programming",
  "depth first search": "dfs",
  "breadth first search": "bfs",
  "union find": "union_find",
  "disjoint set": "union_find",
  "topological sort": "topological_sort",
  "shortest path": "shortest_path",
  "bit manipulation": "bit_manipulation",
  "linked list": "linked_list",
  "binary tree": "binary_tree",
  "priority queue": "priority_queue",
  "ordered set": "ordered_set",
  "segment tree": "segment_tree",
  "monotonic stack": "monotonic_stack",
  "monotonic queue": "monotonic_queue",
  "divide and conquer": "divide_and_conquer",
  "number theory": "number_theory",
  "game theory": "game_theory"
};

const LEGACY_TO_CAUTION = {
  approach_selection: "pattern_choice_check",
  constraint_analysis: "constraint_check",
  data_structure_selection: "pattern_choice_check",
  sorting_criteria: "sort_key_check",
  duplicate_handling: "duplicate_handling_check",
  binary_search_boundary: "boundary_check",
  visited_timing: "visited_timing_check",
  grid_boundary_check: "boundary_check",
  dp_state_definition: "state_definition_check",
  dp_transition: "state_transition_check",
  dp_initialization: "initial_state_check",
  edge_case: "edge_case_check",
  off_by_one: "off_by_one_risk",
  return_value_misunderstanding: "return_value_check",
  time_complexity: "time_complexity_check",
  space_complexity: "space_complexity_check",
  output_format: "return_format_check",
  runtime_error: "null_handling_check"
};

export function cleanTagArray(value, axis, limit = Infinity) {
  const valid = IDS_BY_AXIS[axis] || new Set();
  return uniqueStrings(value)
    .map((item) => normalizeTagId(axis, item))
    .filter((item) => valid.has(item) || (axis === "problem" && Boolean(PROBLEM_ALIAS_LABELS[item])))
    .slice(0, limit);
}

export function normalizeTaxonomyMetadata(metadata = {}) {
  const legacyCategories = uniqueStrings(metadata.categories);
  const legacy = legacyCategoriesToTaxonomy(legacyCategories);
  return {
    problemTypeTags: mergeLimited(
      cleanTagArray(metadata.problem_type_tags || metadata.problemTypeTags, "problem", TAXONOMY_LIMITS.problem),
      legacy.problemTypeTags,
      TAXONOMY_LIMITS.problem
    ),
    cautionPointTags: mergeLimited(
      cleanTagArray(metadata.caution_point_tags || metadata.cautionPointTags, "caution", TAXONOMY_LIMITS.caution),
      legacy.cautionPointTags,
      TAXONOMY_LIMITS.caution
    ),
    implementationHintTags: mergeLimited(
      cleanTagArray(metadata.implementation_hint_tags || metadata.implementationHintTags, "implementation", TAXONOMY_LIMITS.implementation),
      legacy.implementationHintTags,
      TAXONOMY_LIMITS.implementation
    ),
    legacyCategories
  };
}

export function legacyCategoriesToTaxonomy(categories = []) {
  const legacyCategories = uniqueStrings(categories);
  return {
    problemTypeTags: legacyCategories
      .map((category) => LEGACY_TO_PROBLEM[normalizeTagId("problem", category)] || normalizeTagId("problem", category))
      .filter((tag) => tag && IDS_BY_AXIS.problem.has(tag))
      .filter(uniqueFilter),
    cautionPointTags: legacyCategories
      .map((category) => LEGACY_TO_CAUTION[normalizeTagId("caution", category)] || normalizeTagId("caution", category))
      .filter((tag) => tag && IDS_BY_AXIS.caution.has(tag))
      .filter(uniqueFilter),
    implementationHintTags: legacyCategories
      .map((category) => normalizeTagId("implementation", category))
      .filter((category) => IDS_BY_AXIS.implementation.has(category))
      .filter(uniqueFilter)
  };
}

export function taxonomyLabel(axis, id, language = "ko") {
  const lang = String(language || "").startsWith("en") ? "en" : "ko";
  const normalizedId = normalizeTagId(axis, id);
  // 1. Exact match in requested axis
  const tag = (TAGS_BY_AXIS[axis] || []).find((item) => item.id === normalizedId);
  if (tag?.label?.[lang]) return tag.label[lang];
  // 2. Cross-axis search (tag may belong to a different axis)
  for (const tags of Object.values(TAGS_BY_AXIS)) {
    const found = tags.find((item) => item.id === normalizedId);
    if (found?.label?.[lang]) return found.label[lang];
  }
  // 3. Problem aliases that are intentionally more specific than the base taxonomy.
  const aliasLabel = PROBLEM_ALIAS_LABELS[normalizedId];
  if (aliasLabel?.[lang]) return aliasLabel[lang];
  // 4. Legacy hint category labels (e.g. "hashmap_usage" → "해시맵 활용")
  const hintLabel = HINT_CATEGORY_LABELS[normalizedId] || HINT_CATEGORY_LABELS[id];
  if (hintLabel?.[lang]) return hintLabel[lang];
  // 5. Normalize via legacy→taxonomy map, then re-look up
  const canonical = LEGACY_TO_PROBLEM[normalizedId] || LEGACY_TO_CAUTION[normalizedId];
  if (canonical) {
    for (const tags of Object.values(TAGS_BY_AXIS)) {
      const found = tags.find((item) => item.id === canonical);
      if (found?.label?.[lang]) return found.label[lang];
    }
  }
  // 6. Final fallback: keep English readable; avoid raw English in Korean UI.
  return humanizeUnknownTag(normalizedId || id, lang);
}

export function taxonomyLabelsForPrompt(tags) {
  return tags.map((tag) => `${tag.id} (${tag.label.en})`).join(", ");
}

export function taxonomyCategorySummary() {
  return {
    problemTypes: taxonomyLabelsForPrompt(PROBLEM_TYPE_TAGS),
    cautionPoints: taxonomyLabelsForPrompt(CAUTION_POINT_TAGS),
    implementationHints: taxonomyLabelsForPrompt(IMPLEMENTATION_HINT_TAGS)
  };
}

export function aggregateTaxonomyEvents(events = []) {
  return {
    topProblemTypeTags: aggregateAxis(events, "problemTypeTags"),
    topCautionPointTags: aggregateAxis(events, "cautionPointTags"),
    topImplementationHintTags: aggregateAxis(events, "implementationHintTags")
  };
}

function aggregateAxis(events, field) {
  const counts = {};
  const problemSets = {};
  for (const event of events || []) {
    const taxonomy = normalizeEventTaxonomy(event);
    for (const tag of taxonomy[field] || []) {
      counts[tag] = (counts[tag] || 0) + 1;
      if (!problemSets[tag]) problemSets[tag] = new Set();
      problemSets[tag].add(event.problemUrl || event.sessionId || event.id);
    }
  }
  return Object.entries(problemSets)
    .map(([tag, problemSet]) => ({
      tag,
      category: tag,
      count: problemSet.size,
      eventCount: counts[tag] || 0
    }))
    .sort((a, b) => b.count - a.count || b.eventCount - a.eventCount);
}

export function normalizeTaxonomyTag(axis, value) {
  return normalizeTagId(axis, value);
}

function normalizeTagId(axis, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const snake = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/&/g, " and ")
    .replace(/[./]+/g, " ")
    .replace(/[^A-Za-z0-9가-힣]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
  if (axis === "problem") {
    const phrase = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    return PROBLEM_ALIASES[phrase] || PROBLEM_ALIASES[snake.replace(/_/g, " ")] || LEGACY_TO_PROBLEM[snake] || snake;
  }
  if (axis === "caution") return LEGACY_TO_CAUTION[snake] || snake;
  return snake;
}

function humanizeUnknownTag(value, lang) {
  const text = String(value || "").replace(/_/g, " ").trim();
  if (!text) return lang === "en" ? "Unknown" : "미분류";
  if (lang === "en") return text.replace(/\b\w/g, (c) => c.toUpperCase());
  const fallback = {
    unknown: "미분류",
    unknown_ai_topic: "알 수 없는 주제",
    topic: "주제",
    pattern: "패턴",
    sequence: "수열",
    sequences: "수열",
    math: "수학",
    string: "문자열",
    array: "배열",
    graph: "그래프",
    tree: "트리",
    search: "탐색",
    sort: "정렬",
    sorting: "정렬",
    implementation: "구현",
    simulation: "시뮬레이션"
  };
  const exact = fallback[String(value || "").toLowerCase()];
  if (exact) return exact;
  const translated = text
    .split(/\s+/)
    .map((word) => fallback[word.toLowerCase()] || "")
    .filter(Boolean);
  return translated.length ? translated.join("/") : "미분류";
}

function normalizeEventTaxonomy(event = {}) {
  const normalized = normalizeTaxonomyMetadata({
    problemTypeTags: event.problemTypeTags,
    cautionPointTags: event.cautionPointTags,
    implementationHintTags: event.implementationHintTags,
    categories: event.categories
  });
  return normalized;
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).filter(uniqueFilter);
}

function uniqueFilter(value, index, array) {
  return array.indexOf(value) === index;
}

function mergeLimited(first, second, limit) {
  return [...new Set([...(first || []), ...(second || [])])].slice(0, limit);
}
