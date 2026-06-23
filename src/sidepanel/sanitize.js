/**
 * Lightweight DOM-based HTML sanitizer for sidepanel-side use only.
 * Does NOT use external dependencies.
 * NOT safe for use in the service worker (no DOM API there).
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "em", "b", "i", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "pre", "code", "blockquote", "a", "span", "div",
  "details", "summary"
]);

const ALLOWED_ATTRS = {
  a: ["href"],
};

const SAFE_HREF = /^(https?:\/\/|#)/i;

export function sanitizeHtml(html, documentRef = globalThis.document) {
  if (!documentRef) return html;
  const nodeCtor = documentRef.defaultView?.Node || globalThis.Node;
  if (!nodeCtor) return html;
  const template = documentRef.createElement("template");
  template.innerHTML = html;
  sanitizeNode(template.content, nodeCtor);
  const div = documentRef.createElement("div");
  div.append(template.content);
  return div.innerHTML;
}

function sanitizeNode(node, nodeCtor) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === nodeCtor.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attr of [...child.attributes]) {
        const allowed = ALLOWED_ATTRS[tag] || [];
        if (!allowed.includes(attr.name)) {
          child.removeAttribute(attr.name);
        } else if (attr.name === "href" && !SAFE_HREF.test(attr.value)) {
          child.removeAttribute(attr.name);
        }
      }
      sanitizeNode(child, nodeCtor);
    }
  }
}
