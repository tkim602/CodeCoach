import { describe, expect, it } from "vitest";
import { createSseTextParser, progressiveTextParts } from "./coach-stream.js";

describe("coach response streaming", () => {
  it("parses LF, CRLF, split chunks, and a final event without a terminator", () => {
    const parser = createSseTextParser();

    expect(parser.push('data: {"type":"response.output_text.delta","delta":"Hel"}\r\n\r\n')).toBe("Hel");
    expect(parser.push('data: {"type":"response.output_text.delta","delta":"l')).toBe("");
    expect(parser.push('o"}\n\ndata: [DONE]\n\n')).toBe("lo");
    expect(parser.push('data: {"type":"response.output_text.delta","delta":"!"}')).toBe("");
    expect(parser.finish()).toBe("!");
  });

  it("joins multiple data records and ignores malformed or unrelated events", () => {
    const parser = createSseTextParser();
    const event = [
      'data: {"type":"response.output_text.delta","delta":"one"}',
      "data: not-json",
      'data: {"type":"response.completed"}',
      'data: {"type":"response.output_text.delta","delta":" two"}',
      "",
      ""
    ].join("\n");

    expect(parser.push(event)).toBe("one two");
    expect(parser.finish()).toBe("");
  });

  it("preserves whitespace when progressively revealing buffered guest text", () => {
    const text = "one  two\nthree\tend";
    expect(progressiveTextParts(text).join("")).toBe(text);
  });
});
