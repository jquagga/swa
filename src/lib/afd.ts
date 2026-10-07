export type AfdBlock =
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "hr" };

// NWS text products are hard-wrapped at ~66 columns. A non-blank line at
// least this long is almost certainly a wrapped line whose paragraph
// continues on the next line; shorter lines stand on their own.
const WRAPPED_LINE_MIN = 60;

// Section headers look like ".DISCUSSION..." or
// ".AVIATION /12Z TAFS THROUGH 12Z THURSDAY/...".
const SECTION_RE = /^\.(\S(?:.*\S)?)\.{3}$/;

// Leading WMO header lines ("000", "FXUS63 KTOP 071009", "AFDTOP") carry
// no forecast content, so they are dropped.
function isPreamble(line: string): boolean {
  return (
    /^\d{3}$/.test(line) ||
    /^[A-Z]{4}\d{2}\s+[A-Z0-9]{4}\s+\d{6}$/.test(line) ||
    /^AFD[A-Z]{3}$/.test(line)
  );
}

/**
 * Convert raw AFD product text into renderable blocks: hard-wrapped lines
 * are joined into paragraphs, "- " bullets become lists, "&&" becomes a
 * section divider, and ".SECTION..." lines become headings. "$$" and the
 * WMO header lines are dropped.
 */
export function parseAfdProduct(productText: string): AfdBlock[] {
  const blocks: AfdBlock[] = [];
  let current = "";
  let listItems: string[] | null = null;

  function flushPara(): void {
    if (current) {
      blocks.push({ kind: "para", text: current });
      current = "";
    }
  }

  function flushList(): void {
    if (listItems && listItems.length > 0) {
      // Bullets separated by blank lines still belong to one list.
      const last = blocks[blocks.length - 1];
      if (last?.kind === "list") {
        last.items.push(...listItems);
      } else {
        blocks.push({ kind: "list", items: listItems });
      }
    }
    listItems = null;
  }

  function flushAll(): void {
    flushPara();
    flushList();
  }

  for (const rawLine of productText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "$$") {
      flushAll();
      continue;
    }
    if (line === "&&") {
      flushAll();
      blocks.push({ kind: "hr" });
      continue;
    }
    if (isPreamble(line)) {
      flushAll();
      continue;
    }
    const section = SECTION_RE.exec(line);
    if (section) {
      flushAll();
      blocks.push({ kind: "heading", text: section[1].trim() });
      continue;
    }
    if (line === "-" || line.startsWith("- ")) {
      flushPara();
      if (!listItems) listItems = [];
      listItems.push(line.replace(/^-\s*/, ""));
      continue;
    }
    if (listItems && /^\s/.test(rawLine)) {
      // Indented continuation of the current bullet (NWS uses hanging
      // indents for wrapped bullet text).
      listItems[listItems.length - 1] += ` ${line}`;
      continue;
    }
    flushList();
    if (current && current.length >= WRAPPED_LINE_MIN) {
      current += ` ${line}`;
    } else {
      flushPara();
      current = line;
    }
  }
  flushAll();

  return blocks;
}

/**
 * Unwrap NWS hard-wrapped text (alert `description` / `instruction`):
 * single newlines within a paragraph become spaces, blank lines stay as
 * paragraph breaks, and `* ` / `- ` bullet lines always start a new
 * paragraph. Uses the same wrapped-line heuristic as the AFD parser.
 */
export function unwrapNwsHardWrap(text: string): string {
  const paragraphs: string[] = [];
  let current = "";
  let currentIsBullet = false;

  function flush(): void {
    if (current) {
      paragraphs.push(current);
      current = "";
    }
    currentIsBullet = false;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^[*-]\s/.test(line)) {
      flush();
      current = line;
      currentIsBullet = true;
      continue;
    }
    if (
      current &&
      (current.length >= WRAPPED_LINE_MIN ||
        (currentIsBullet && /^\s/.test(rawLine)))
    ) {
      current += ` ${line}`;
    } else {
      flush();
      current = line;
    }
  }
  flush();

  return paragraphs.join("\n\n");
}
