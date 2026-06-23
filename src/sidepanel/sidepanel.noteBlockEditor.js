// Notion-style block editor.
// Usage: const editor = createBlockEditor(container)
// editor.setHTML(html)  — parse HTML into blocks and render
// editor.getHTML()      — serialize blocks back to HTML
// editor.focus()        — focus the first (or last) block
// editor.clear()        — reset to one empty paragraph block

import { sanitizeHtml } from "./sanitize.js";

const BLOCK_TYPES = [
  { type: "paragraph",  label: "Text",         icon: "T",   shortcut: "" },
  { type: "heading1",   label: "Heading 1",     icon: "H₁",  shortcut: "#" },
  { type: "heading2",   label: "Heading 2",     icon: "H₂",  shortcut: "##" },
  { type: "heading3",   label: "Heading 3",     icon: "H₃",  shortcut: "###" },
  { type: "bullet",     label: "Bulleted list",  icon: "•",   shortcut: "-" },
  { type: "numbered",   label: "Numbered list",  icon: "1.",  shortcut: "1." },
  { type: "todo",       label: "To-do list",     icon: "☐",   shortcut: "[]" },
  { type: "quote",      label: "Quote",          icon: "❝",   shortcut: ">" },
];

const PLACEHOLDER_FOR_TYPE = {
  paragraph: "",
  heading1: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  bullet: "List item",
  numbered: "List item",
  todo: "To-do",
  quote: "Quote",
};

function escapeHtmlStr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createBlockEditor(container, { documentRef = document } = {}) {
  // --- slash menu state ---
  let slashMenuOpen = false;
  let slashActiveIndex = 0;
  let slashAnchorBlock = null;

  // --- handle menu state ---
  let handleMenuOpen = false;
  let handleMenuBlock = null;

  // --- build slash menu ---
  const slashMenu = documentRef.createElement("div");
  slashMenu.className = "nb-slash-menu";
  slashMenu.setAttribute("hidden", "");
  slashMenu.innerHTML = `<div class="nb-slash-section">Basic blocks</div>` +
    BLOCK_TYPES.map((bt, i) =>
      `<button class="nb-slash-item${i === 0 ? " is-active" : ""}" data-block-type="${bt.type}" type="button">` +
      `<span class="nb-slash-icon">${escapeHtmlStr(bt.icon)}</span>` +
      `<span class="nb-slash-name">${escapeHtmlStr(bt.label)}</span>` +
      `<span class="nb-slash-shortcut">${escapeHtmlStr(bt.shortcut)}</span>` +
      `</button>`
    ).join("") +
    `<div class="nb-slash-footer"><span>Close menu</span><kbd>esc</kbd></div>`;

  // --- build handle menu (block-type picker on ⋮⋮ click) ---
  const handleMenu = documentRef.createElement("div");
  handleMenu.className = "nb-slash-menu";
  handleMenu.setAttribute("hidden", "");
  handleMenu.innerHTML = `<div class="nb-slash-section">Turn into</div>` +
    BLOCK_TYPES.map((bt) =>
      `<button class="nb-slash-item" data-block-type="${bt.type}" type="button">` +
      `<span class="nb-slash-icon">${escapeHtmlStr(bt.icon)}</span>` +
      `<span class="nb-slash-name">${escapeHtmlStr(bt.label)}</span>` +
      `<span class="nb-slash-shortcut">${escapeHtmlStr(bt.shortcut)}</span>` +
      `</button>`
    ).join("") +
    `<div class="nb-slash-footer"><span>Close</span><kbd>esc</kbd></div>`;

  // --- setup container ---
  container.innerHTML = "";
  container.className = (container.className ? container.className + " " : "") + "note-block-editor";
  container.appendChild(slashMenu);
  container.appendChild(handleMenu);

  // --- helpers ---
  function getBlocks() {
    return [...container.querySelectorAll(".nb-block")];
  }

  function getBlockContent(block) {
    return block.querySelector(".nb-block-content");
  }

  function focusEnd(el) {
    el.focus();
    const range = documentRef.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = documentRef.defaultView?.getSelection?.();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function getActiveBlock() {
    const active = documentRef.activeElement;
    if (!active) return null;
    return active.closest(".nb-block");
  }

  function createBlock(type, html = "", checked = false) {
    const block = documentRef.createElement("div");
    block.className = `nb-block nb-type-${type}`;
    block.dataset.type = type;

    const handle = documentRef.createElement("span");
    handle.className = "nb-drag-handle";
    handle.setAttribute("aria-hidden", "true");
    handle.textContent = "⋮⋮";
    block.appendChild(handle);

    if (type === "todo") {
      block.dataset.checked = String(checked);
      const checkbox = documentRef.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "nb-todo-check";
      checkbox.setAttribute("aria-label", "Done");
      checkbox.checked = checked;
      checkbox.addEventListener("change", () => {
        block.dataset.checked = String(checkbox.checked);
      });
      block.appendChild(checkbox);
    }

    const content = documentRef.createElement("div");
    content.className = "nb-block-content";
    content.contentEditable = "true";
    content.dataset.placeholder = PLACEHOLDER_FOR_TYPE[type] ?? "";
    content.innerHTML = html;
    block.appendChild(content);

    return block;
  }

  function renderBlocks(blockSpecs) {
    // Remove all existing editable content while preserving the shared slash menu.
    for (const child of [...container.children]) {
      if (child !== slashMenu) child.remove();
    }
    for (const spec of blockSpecs) {
      const block = createBlock(spec.type, spec.html || "", spec.checked || false);
      container.appendChild(block);
    }
  }

  // --- handle menu control ---
  function openHandleMenu(block, handleEl) {
    if (slashMenuOpen) closeSlashMenu();
    handleMenuOpen = true;
    handleMenuBlock = block;
    const currentType = block.dataset.type || "paragraph";
    [...handleMenu.querySelectorAll(".nb-slash-item")].forEach((item) => {
      item.classList.toggle("is-active", item.dataset.blockType === currentType);
    });
    handleMenu.hidden = false;
    const handleRect = handleEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const menuHeight = handleMenu.offsetHeight || 280;
    const spaceBelow = containerRect.bottom - handleRect.bottom;
    const spaceAbove = handleRect.top - containerRect.top;
    let top;
    if (spaceBelow >= menuHeight || spaceBelow >= spaceAbove) {
      top = handleRect.bottom - containerRect.top + 4;
    } else {
      top = handleRect.top - containerRect.top - menuHeight - 4;
    }
    handleMenu.style.top = `${Math.max(0, top)}px`;
    const left = handleRect.right - containerRect.left + 4;
    const maxLeft = containerRect.width - (handleMenu.offsetWidth || 200);
    handleMenu.style.left = `${Math.min(Math.max(0, left), Math.max(0, maxLeft))}px`;
  }

  function closeHandleMenu() {
    handleMenuOpen = false;
    handleMenuBlock = null;
    handleMenu.setAttribute("hidden", "");
  }

  // --- slash menu control ---
  function openSlashMenu(anchorBlock) {
    if (handleMenuOpen) closeHandleMenu();
    slashMenuOpen = true;
    slashAnchorBlock = anchorBlock;
    slashActiveIndex = 0;
    updateSlashMenuHighlight();

    // Position menu with flip-up logic
    slashMenu.hidden = false;
    const anchorRect = anchorBlock.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const menuHeight = slashMenu.offsetHeight || 280;
    const spaceBelow = containerRect.bottom - anchorRect.bottom;
    const spaceAbove = anchorRect.top - containerRect.top;

    let top;
    if (spaceBelow >= menuHeight || spaceBelow >= spaceAbove) {
      // show below
      top = anchorRect.bottom - containerRect.top + 4;
    } else {
      // flip above
      top = anchorRect.top - containerRect.top - menuHeight - 4;
    }
    slashMenu.style.top = `${Math.max(0, top)}px`;

    // Clamp right edge
    const left = Math.max(0, anchorRect.left - containerRect.left);
    const maxLeft = containerRect.width - (slashMenu.offsetWidth || 200);
    slashMenu.style.left = `${Math.min(left, Math.max(0, maxLeft))}px`;
  }

  function closeSlashMenu() {
    slashMenuOpen = false;
    slashAnchorBlock = null;
    slashMenu.setAttribute("hidden", "");
  }

  function updateSlashMenuHighlight() {
    const items = [...slashMenu.querySelectorAll(".nb-slash-item")];
    items.forEach((item, i) => {
      item.classList.toggle("is-active", i === slashActiveIndex);
    });
    items[slashActiveIndex]?.scrollIntoView({ block: "nearest" });
  }

  function confirmSlashMenu() {
    const items = [...slashMenu.querySelectorAll(".nb-slash-item")];
    const activeItem = items[slashActiveIndex];
    if (!activeItem || !slashAnchorBlock) return;
    const newType = activeItem.dataset.blockType;
    convertBlockType(slashAnchorBlock, newType);
    // Clear the "/" character
    const contentEl = getBlockContent(slashAnchorBlock);
    if (contentEl && contentEl.textContent === "/") {
      contentEl.innerHTML = "";
    }
    closeSlashMenu();
    focusEnd(contentEl || getBlockContent(slashAnchorBlock));
  }

  // --- block type conversion ---
  function convertBlockType(block, newType) {
    const contentEl = getBlockContent(block);
    const html = contentEl ? contentEl.innerHTML : "";
    const checked = block.dataset.checked === "true";

    block.className = `nb-block nb-type-${newType}`;
    block.dataset.type = newType;

    // Handle todo checkbox
    const existingCheckbox = block.querySelector(".nb-todo-check");
    if (newType === "todo") {
      block.dataset.checked = String(checked);
      if (!existingCheckbox) {
        const checkbox = documentRef.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "nb-todo-check";
        checkbox.setAttribute("aria-label", "Done");
        checkbox.checked = checked;
        checkbox.addEventListener("change", () => {
          block.dataset.checked = String(checkbox.checked);
        });
        // Insert after handle
        const handle = block.querySelector(".nb-drag-handle");
        if (handle) {
          handle.after(checkbox);
        } else {
          block.insertBefore(checkbox, block.firstChild);
        }
      }
    } else {
      if (existingCheckbox) {
        existingCheckbox.remove();
      }
      delete block.dataset.checked;
    }

    // Update placeholder
    if (contentEl) {
      contentEl.dataset.placeholder = PLACEHOLDER_FOR_TYPE[newType] ?? "";
    }
  }

  // --- split block at cursor (for Enter key) ---
  function splitBlock(block) {
    const sel = documentRef.defaultView?.getSelection?.();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const contentEl = getBlockContent(block);
    if (!contentEl) return;

    const type = block.dataset.type;

    // Get content after cursor as a fragment
    const afterRange = documentRef.createRange();
    afterRange.setStart(range.endContainer, range.endOffset);
    afterRange.setEndAfter(contentEl.lastChild || contentEl);

    // But we need to contain it within contentEl
    try {
      afterRange.setEnd(contentEl, contentEl.childNodes.length);
    } catch (e) {
      // ignore
    }

    const afterFrag = afterRange.cloneContents();
    const afterDiv = documentRef.createElement("div");
    afterDiv.appendChild(afterFrag);
    const afterHtml = afterDiv.innerHTML;

    // Delete content from cursor to end of contentEl
    const deleteRange = documentRef.createRange();
    deleteRange.setStart(range.endContainer, range.endOffset);
    try {
      deleteRange.setEnd(contentEl, contentEl.childNodes.length);
    } catch (e) {
      // ignore
    }
    deleteRange.deleteContents();

    // Determine new block type
    let newType;
    const currentIsEmpty = contentEl.textContent.trim() === "" && contentEl.innerHTML.trim() === "";

    if (currentIsEmpty && (type === "bullet" || type === "numbered" || type === "todo")) {
      // Empty list item → convert to paragraph
      convertBlockType(block, "paragraph");
      return;
    }

    if (type === "heading1" || type === "heading2" || type === "heading3" || type === "quote") {
      newType = "paragraph";
    } else {
      newType = type;
    }

    // Create new block with the after-content
    const newBlock = createBlock(newType, afterHtml);
    block.after(newBlock);
    focusEnd(getBlockContent(newBlock));
  }

  // --- keyboard delegation ---
  container.addEventListener("keydown", (e) => {
    const block = getActiveBlock();

    if (e.key === "Escape") {
      if (slashMenuOpen) { closeSlashMenu(); e.preventDefault(); }
      if (handleMenuOpen) { closeHandleMenu(); e.preventDefault(); }
      return;
    }

    if (e.key === "ArrowUp" && slashMenuOpen) {
      const items = slashMenu.querySelectorAll(".nb-slash-item");
      slashActiveIndex = (slashActiveIndex - 1 + items.length) % items.length;
      updateSlashMenuHighlight();
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowDown" && slashMenuOpen) {
      const items = slashMenu.querySelectorAll(".nb-slash-item");
      slashActiveIndex = (slashActiveIndex + 1) % items.length;
      updateSlashMenuHighlight();
      e.preventDefault();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      if (slashMenuOpen) {
        confirmSlashMenu();
        e.preventDefault();
        return;
      }
      if (block) {
        splitBlock(block);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "Backspace") {
      if (slashMenuOpen) {
        // Let the input event handle filtering; don't intercept
        return;
      }
      if (block) {
        const contentEl = getBlockContent(block);
        const isEmpty = !contentEl || (contentEl.textContent === "" && contentEl.innerHTML === "");
        if (isEmpty) {
          const blocks = getBlocks();
          const idx = blocks.indexOf(block);
          if (idx > 0) {
            const prevBlock = blocks[idx - 1];
            block.remove();
            focusEnd(getBlockContent(prevBlock));
            e.preventDefault();
          }
        }
      }
    }
  });

  // --- input event — open slash menu ---
  container.addEventListener("input", (e) => {
    const target = e.target;
    if (!target.classList.contains("nb-block-content")) return;
    const block = target.closest(".nb-block");
    if (!block) return;

    if (slashMenuOpen) {
      // Filter or close based on content after "/"
      const text = target.textContent;
      if (!text.startsWith("/")) {
        closeSlashMenu();
      }
      return;
    }

    // Open slash menu when block content is exactly "/"
    if (target.textContent === "/") {
      openSlashMenu(block);
    }
  });

  // --- drag handle click → open handle menu ---
  container.addEventListener("click", (e) => {
    const handle = e.target.closest(".nb-drag-handle");
    if (!handle) return;
    const block = handle.closest(".nb-block");
    if (!block) return;
    if (handleMenuOpen && handleMenuBlock === block) {
      closeHandleMenu();
      return;
    }
    openHandleMenu(block, handle);
  });

  // --- handle menu item click ---
  handleMenu.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".nb-slash-item");
    if (!item) return;
    e.preventDefault();
    const newType = item.dataset.blockType;
    if (handleMenuBlock) {
      convertBlockType(handleMenuBlock, newType);
      const contentEl = getBlockContent(handleMenuBlock);
      closeHandleMenu();
      if (contentEl) focusEnd(contentEl);
    }
  });

  // --- slash menu item click ---
  slashMenu.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".nb-slash-item");
    if (!item) return;
    e.preventDefault(); // Prevent blur
    const newType = item.dataset.blockType;
    if (slashAnchorBlock) {
      convertBlockType(slashAnchorBlock, newType);
      const contentEl = getBlockContent(slashAnchorBlock);
      if (contentEl && contentEl.textContent === "/") {
        contentEl.innerHTML = "";
      }
      closeSlashMenu();
      if (contentEl) focusEnd(contentEl);
    }
  });

  // --- close on outside click ---
  function handleOutsideClick(e) {
    if (!slashMenu.contains(e.target)) closeSlashMenu();
    if (!handleMenu.contains(e.target) && !e.target.closest(".nb-drag-handle")) closeHandleMenu();
  }
  documentRef.addEventListener("mousedown", handleOutsideClick);

  // --- parse HTML into block specs ---
  function parseHTMLToBlocks(html) {
    const div = documentRef.createElement("div");
    div.innerHTML = html || "";
    const blocks = [];
    for (const el of div.childNodes) {
      if (el.nodeType === 3 /* TEXT_NODE */) {
        const text = el.textContent.trim();
        if (text) blocks.push({ type: "paragraph", html: escapeHtmlStr(text) });
        continue;
      }
      const tag = el.tagName?.toLowerCase();
      if (!tag) continue;
      if (tag === "p") blocks.push({ type: "paragraph", html: el.innerHTML });
      else if (tag === "h1") blocks.push({ type: "heading1", html: el.innerHTML });
      else if (tag === "h2") blocks.push({ type: "heading2", html: el.innerHTML });
      else if (tag === "h3") blocks.push({ type: "heading3", html: el.innerHTML });
      else if (tag === "blockquote") blocks.push({ type: "quote", html: el.innerHTML });
      else if (tag === "ul") {
        const isTodo = el.classList.contains("todo-list");
        for (const li of el.querySelectorAll("li")) {
          if (isTodo) {
            const checked = li.dataset.checked === "true" || li.querySelector("input[type=checkbox]")?.checked;
            const innerHtml = li.innerHTML.replace(/<input[^>]*>/gi, "").trim();
            blocks.push({ type: "todo", html: innerHtml, checked });
          } else {
            blocks.push({ type: "bullet", html: li.innerHTML });
          }
        }
      } else if (tag === "ol") {
        for (const li of el.querySelectorAll("li")) {
          blocks.push({ type: "numbered", html: li.innerHTML });
        }
      } else {
        // fallback: treat as paragraph
        blocks.push({ type: "paragraph", html: el.innerHTML || el.textContent });
      }
    }
    return blocks.length ? blocks : [{ type: "paragraph", html: "" }];
  }

  // --- serialize blocks to HTML ---
  function getHTML() {
    const blocks = getBlocks();
    const parts = [];
    let ulOpen = false, olOpen = false, todoOpen = false;

    function closeLists() {
      if (ulOpen) { parts.push("</ul>"); ulOpen = false; }
      if (olOpen) { parts.push("</ol>"); olOpen = false; }
      if (todoOpen) { parts.push("</ul>"); todoOpen = false; }
    }

    for (const block of blocks) {
      const type = block.dataset.type;
      const content = sanitizeHtml(block.querySelector(".nb-block-content")?.innerHTML || "", documentRef);
      if (type === "bullet") {
        if (!ulOpen) { closeLists(); parts.push("<ul>"); ulOpen = true; }
        parts.push(`<li>${content}</li>`);
      } else if (type === "numbered") {
        if (!olOpen) { closeLists(); parts.push("<ol>"); olOpen = true; }
        parts.push(`<li>${content}</li>`);
      } else if (type === "todo") {
        if (!todoOpen) { closeLists(); parts.push('<ul class="todo-list">'); todoOpen = true; }
        const checked = block.dataset.checked === "true";
        parts.push(`<li data-checked="${checked}">${content}</li>`);
      } else {
        closeLists();
        const tag = { paragraph: "p", heading1: "h1", heading2: "h2", heading3: "h3", quote: "blockquote" }[type] || "p";
        parts.push(`<${tag}>${content}</${tag}>`);
      }
    }
    closeLists();
    return parts.join("");
  }

  // --- public API ---
  function setHTML(html) {
    const safeHtml = typeof html === "string" ? sanitizeHtml(html, documentRef) : "";
    const specs = parseHTMLToBlocks(safeHtml);
    renderBlocks(specs);
  }

  function focus() {
    const blocks = getBlocks();
    if (blocks.length === 0) {
      // Create default block
      const block = createBlock("paragraph", "");
      container.appendChild(block);
    }
    const firstContent = getBlockContent(getBlocks()[0]);
    if (firstContent) firstContent.focus();
  }

  function clear() {
    renderBlocks([{ type: "paragraph", html: "" }]);
  }

  // Initialize with one empty paragraph
  clear();

  return { setHTML, getHTML, focus, clear, destroy() {
    documentRef.removeEventListener("mousedown", handleOutsideClick);
  }};
}
