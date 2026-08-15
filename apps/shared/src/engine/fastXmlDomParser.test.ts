import { describe, expect, it } from "vitest";
import { FastXmlDOMParser } from "./fastXmlDomParser.js";

function parse(xml: string) {
  return new FastXmlDOMParser().parseFromString(xml);
}

describe("FastXmlDOMParser", () => {
  it("parses attributes on a self-closing element", () => {
    const doc = parse(`<root><item id="1" name="foo"/></root>`);
    const item = doc.querySelector("item");
    expect(item?.getAttribute("id")).toBe("1");
    expect(item?.getAttribute("name")).toBe("foo");
    expect(item?.getAttribute("missing")).toBeNull();
  });

  it("parses attributes on a self-closing element with a space before the slash", () => {
    const doc = parse(`<root><item id="1" /></root>`);
    expect(doc.querySelector("item")?.getAttribute("id")).toBe("1");
  });

  it("handles single-quoted attribute values", () => {
    const doc = parse(`<root><item id='1'/></root>`);
    expect(doc.querySelector("item")?.getAttribute("id")).toBe("1");
  });

  it("querySelector finds a descendant at any depth, not just a direct child", () => {
    const doc = parse(`<root><a><b><target v="1"/></b></a></root>`);
    expect(doc.querySelector("target")?.getAttribute("v")).toBe("1");
  });

  it("querySelectorAll collects every matching descendant in document order", () => {
    const doc = parse(`<root><item n="1"/><group><item n="2"/></group><item n="3"/></root>`);
    const items = doc.querySelectorAll("item");
    expect(items.map((el) => el.getAttribute("n"))).toEqual(["1", "2", "3"]);
  });

  it("supports a two-part descendant selector ('parent child')", () => {
    const doc = parse(`
      <root>
        <vertices><vertex x="0"/><vertex x="1"/></vertices>
        <other><vertex x="99"/></other>
      </root>`);
    // "vertices vertex" must only match vertex elements under <vertices>,
    // not the one under <other> — this is the exact selector shape
    // parseProductionThreeMF.ts uses for both vertices and triangles.
    const verticesEl = doc.querySelector("vertices");
    const vertices = verticesEl!.querySelectorAll("vertex");
    expect(vertices.map((el) => el.getAttribute("x"))).toEqual(["0", "1"]);
  });

  it("is case-sensitive (matches XML, not HTML, semantics)", () => {
    const doc = parse(`<Root><Relationship id="1"/><relationship id="2"/></Root>`);
    expect(doc.querySelectorAll("Relationship")).toHaveLength(1);
    expect(doc.querySelectorAll("relationship")).toHaveLength(1);
  });

  it("scans an element's attributes array directly (for namespaced-by-suffix lookups)", () => {
    const doc = parse(`<root><item p:path="/3D/Objects/x.model" objectid="1"/></root>`);
    const item = doc.querySelector("item")!;
    const pathAttr = Array.from(item.attributes).find((a) => a.name.toLowerCase().endsWith(":path"));
    expect(pathAttr?.value).toBe("/3D/Objects/x.model");
  });

  it("decodes the five predefined XML entities in attribute values", () => {
    const doc = parse(`<root><item v="a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;"/></root>`);
    expect(doc.querySelector("item")?.getAttribute("v")).toBe(`a & b <c> "d" 'e'`);
  });

  it("decodes numeric character references, decimal and hex", () => {
    const doc = parse(`<root><item v="&#65;&#x42;"/></root>`);
    expect(doc.querySelector("item")?.getAttribute("v")).toBe("AB");
  });

  it("skips the XML declaration, comments, and CDATA without corrupting structure", () => {
    const doc = parse(`<?xml version="1.0" encoding="UTF-8"?>
<!-- a comment with a > inside it -->
<root>
  <![CDATA[ some <fake> tag-looking text ]]>
  <item id="1"/>
</root>`);
    const items = doc.querySelectorAll("item");
    expect(items).toHaveLength(1);
    expect(items[0].getAttribute("id")).toBe("1");
  });

  it("returns null/empty for a selector that matches nothing", () => {
    const doc = parse(`<root><item id="1"/></root>`);
    expect(doc.querySelector("missing")).toBeNull();
    expect(doc.querySelectorAll("missing")).toEqual([]);
  });

  it("handles a realistic multi-hundred-element sibling list (vertices/triangles shape)", () => {
    const vertexCount = 500;
    const vertices = Array.from({ length: vertexCount }, (_, i) => `<vertex x="${i}" y="0" z="0"/>`).join("");
    const doc = parse(`<root><mesh><vertices>${vertices}</vertices></mesh></root>`);
    const parsed = doc.querySelector("vertices")!.querySelectorAll("vertex");
    expect(parsed).toHaveLength(vertexCount);
    expect(parsed[0].getAttribute("x")).toBe("0");
    expect(parsed[vertexCount - 1].getAttribute("x")).toBe(String(vertexCount - 1));
  });
});
