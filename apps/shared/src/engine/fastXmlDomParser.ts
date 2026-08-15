/**
 * Purpose-built XML parser standing in for the browser's native DOMParser
 * in contexts that don't have one (Web Workers — see
 * apps/web/src/workers/meshParseWorker.ts). Exists because the previous
 * fix (polyfilling with linkedom, which builds a full spec-compliant DOM
 * tree) measured at ~11s to parse a real 36.7MB 3MF model XML — linkedom's
 * generality costs a lot for documents this large, and a real user's file
 * hit exactly that case.
 *
 * parseProductionThreeMF.ts only ever needs `getAttribute`, `attributes`
 * (to scan for a `p:path`-style namespaced attribute by suffix), and
 * `querySelector(All)` with plain tag-name or two-tag descendant selectors
 * (verified by grepping every call site — no attribute selectors, no
 * classes, no text content read anywhere) — so this only implements that
 * narrow surface, not general XML/DOM semantics. It is NOT a general-
 * purpose XML parser: no namespace-URI resolution (matches how the
 * previously-working linkedom-based code behaved too — 3MF's own elements
 * are never namespace-prefixed, only some attributes are), no text nodes,
 * no CDATA content, no DTD/entity-declaration processing beyond the five
 * predefined XML entities plus numeric character references.
 */

export interface FastXmlAttr {
  name: string;
  value: string;
}

export class FastXmlElement {
  readonly tagName: string;
  readonly attributes: FastXmlAttr[] = [];
  readonly children: FastXmlElement[] = [];

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  getAttribute(name: string): string | null {
    for (const attr of this.attributes) {
      if (attr.name === name) return attr.value;
    }
    return null;
  }

  querySelector(selector: string): FastXmlElement | null {
    return queryFirst(this, splitSelector(selector));
  }

  querySelectorAll(selector: string): FastXmlElement[] {
    return queryAll(this, splitSelector(selector));
  }
}

function splitSelector(selector: string): string[] {
  return selector.trim().split(/\s+/);
}

// Collects every descendant of `root` (not root itself, matching
// querySelectorAll semantics) whose tagName matches, via a single DFS pass.
function collectByTag(root: FastXmlElement, tag: string, out: FastXmlElement[]): void {
  for (const child of root.children) {
    if (child.tagName === tag) out.push(child);
    if (child.children.length > 0) collectByTag(child, tag, out);
  }
}

// "a b c" (CSS descendant combinator semantics): every match for the last
// tag that has an ancestor chain through matches of each preceding tag, in
// order — not necessarily direct parent/child.
function queryAll(root: FastXmlElement, parts: string[]): FastXmlElement[] {
  let candidates: FastXmlElement[] = [];
  collectByTag(root, parts[0], candidates);
  for (let i = 1; i < parts.length; i++) {
    const next: FastXmlElement[] = [];
    for (const el of candidates) collectByTag(el, parts[i], next);
    candidates = next;
  }
  return candidates;
}

function queryFirst(root: FastXmlElement, parts: string[]): FastXmlElement | null {
  if (parts.length === 1) {
    return findFirstByTag(root, parts[0]);
  }
  // Multi-part selectors are rare (only "vertices vertex" / "triangles
  // triangle" in practice) and never on documents large enough for the
  // full collect-then-narrow of queryAll to matter — simplicity over a
  // short-circuiting DFS here.
  const all = queryAll(root, parts);
  return all.length > 0 ? all[0] : null;
}

function findFirstByTag(root: FastXmlElement, tag: string): FastXmlElement | null {
  for (const child of root.children) {
    if (child.tagName === tag) return child;
    if (child.children.length > 0) {
      const found = findFirstByTag(child, tag);
      if (found) return found;
    }
  }
  return null;
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const ENTITY_RE = /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g;

function decodeEntities(value: string): string {
  if (value.indexOf("&") === -1) return value;
  return value.replace(ENTITY_RE, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

// Sticky (`y`) regexes match only starting exactly at `lastIndex`, letting
// this scan the full text in place — no per-token substring allocation,
// which matters at the scale a 3MF model part's vertex/triangle lists
// reach (hundreds of thousands of elements).
const TAG_NAME_RE = /<([A-Za-z_][\w:.-]*)/y;
const ATTR_RE = /\s*([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/y;
const TAG_END_RE = /\s*(\/?)\s*>/y;

function parseXml(text: string): FastXmlElement {
  const root = new FastXmlElement("#document");
  const stack: FastXmlElement[] = [root];
  const len = text.length;
  let pos = 0;

  while (pos < len) {
    const lt = text.indexOf("<", pos);
    if (lt === -1) break;

    if (text.startsWith("<?", lt)) {
      const end = text.indexOf("?>", lt + 2);
      pos = end === -1 ? len : end + 2;
      continue;
    }
    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      pos = end === -1 ? len : end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", lt)) {
      const end = text.indexOf("]]>", lt + 9);
      pos = end === -1 ? len : end + 3;
      continue;
    }
    if (text.startsWith("<!", lt)) {
      // DOCTYPE or other markup declaration — not used by 3MF, skip to the
      // next '>' rather than fully parsing (no internal-subset brackets to
      // worry about in practice).
      const end = text.indexOf(">", lt + 2);
      pos = end === -1 ? len : end + 1;
      continue;
    }
    if (text[lt + 1] === "/") {
      const end = text.indexOf(">", lt + 2);
      if (stack.length > 1) stack.pop();
      pos = end === -1 ? len : end + 1;
      continue;
    }

    TAG_NAME_RE.lastIndex = lt;
    const nameMatch = TAG_NAME_RE.exec(text);
    if (!nameMatch) {
      // A bare '<' that isn't a valid tag start — not well-formed XML, but
      // skip past it rather than looping forever.
      pos = lt + 1;
      continue;
    }
    const element = new FastXmlElement(nameMatch[1]);
    let cursor = TAG_NAME_RE.lastIndex;

    for (;;) {
      ATTR_RE.lastIndex = cursor;
      const attrMatch = ATTR_RE.exec(text);
      if (!attrMatch) break;
      const rawValue = attrMatch[3] !== undefined ? attrMatch[3] : (attrMatch[4] ?? "");
      element.attributes.push({ name: attrMatch[1], value: decodeEntities(rawValue) });
      cursor = ATTR_RE.lastIndex;
    }

    TAG_END_RE.lastIndex = cursor;
    const endMatch = TAG_END_RE.exec(text);
    let selfClosing: boolean;
    if (endMatch) {
      selfClosing = endMatch[1] === "/";
      cursor = TAG_END_RE.lastIndex;
    } else {
      // Malformed tag close — recover by seeking the next '>' rather than
      // stalling.
      const fallbackEnd = text.indexOf(">", cursor);
      cursor = fallbackEnd === -1 ? len : fallbackEnd + 1;
      selfClosing = text[cursor - 2] === "/";
    }

    stack[stack.length - 1].children.push(element);
    if (!selfClosing) stack.push(element);
    pos = cursor;
  }

  return root;
}

/** Drop-in for `new DOMParser()` — same `parseFromString` shape, structural
 * match for the `MinimalDOMParser`/`MinimalDocument`/`MinimalElement`
 * interfaces parseProductionThreeMF.ts declares (TypeScript structural
 * typing means no import/export coupling between the two files is needed). */
export class FastXmlDOMParser {
  parseFromString(text: string): FastXmlElement {
    return parseXml(text);
  }
}
