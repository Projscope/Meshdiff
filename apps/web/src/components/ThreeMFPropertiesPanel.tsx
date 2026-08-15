import type { ThreeMFProperties } from "../engine/load3mfDisplayExtras";
import CollapsibleSection, { PropertyList, PropertyRow } from "./CollapsibleSection";

const FIELD_LABELS: Record<string, string> = {
  Title: "Title",
  Designer: "Designer",
  Description: "Description",
  Copyright: "Copyright",
  LicenseTerms: "License",
  Rating: "Rating",
  CreationDate: "Created",
  ModificationDate: "Modified",
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  copy: "©",
  reg: "®",
  trade: "™",
};

function decodeEntitiesOnce(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const code = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

// Block-level tags become a real line break instead of vanishing into the
// same run-on line as everything else — this is what keeps the source's
// paragraph/heading/list structure legible instead of flattening it.
const BLOCK_TAG = /<\/?(p|div|h[1-6]|li|br)\b[^>]*>/gi;

// Some slicers (BambuStudio) write metadata as escaped HTML — the raw
// textContent literally contains "&lt;h3&gt;&lt;strong&gt;..." rather than
// real markup, sometimes double-escaped. Decode entities (repeatedly, in
// case of double-encoding), turn block tags into line breaks, then strip
// whatever inline tags (<strong>, <em>, ...) remain — this panel is a
// properties list, not a full rich-text renderer, but the original
// paragraph structure is worth keeping.
function cleanMetadataValue(value: string): string {
  let decoded = value;
  for (let i = 0; i < 3; i++) {
    const next = decodeEntitiesOnce(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded
    .replace(BLOCK_TAG, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, all) => line.length > 0 || (i > 0 && all[i - 1].length > 0))
    .join("\n")
    .trim();
}

interface ThreeMFPropertiesPanelProps {
  properties: ThreeMFProperties;
  defaultOpen?: boolean;
}

export default function ThreeMFPropertiesPanel({ properties, defaultOpen = false }: ThreeMFPropertiesPanelProps) {
  const entries = Object.entries(properties.metadata);

  return (
    <CollapsibleSection title="3MF Properties" defaultOpen={defaultOpen}>
      <PropertyList>
        <PropertyRow label="Unit" value={properties.unit} />
        {entries.map(([key, value]) => (
          <div key={key} className="px-3 py-2 text-xs">
            <span className="block text-neutral-500">{FIELD_LABELS[key] ?? key}</span>
            <span className="mt-0.5 block whitespace-pre-line break-words text-left leading-relaxed text-neutral-200">
              {cleanMetadataValue(value)}
            </span>
          </div>
        ))}
      </PropertyList>
    </CollapsibleSection>
  );
}
