import { describe, expect, it } from "vitest";
import * as fflate from "fflate";
import { DOMParser } from "linkedom";
import { parseProductionThreeMF } from "./parseProductionThreeMF.js";

(globalThis as { DOMParser?: unknown }).DOMParser = DOMParser;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

function buildFixture(
  rootModel: string,
  objectModels: Record<string, string>,
  extraFiles: Record<string, string> = {},
): ArrayBuffer {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": new TextEncoder().encode(CONTENT_TYPES),
    "_rels/.rels": new TextEncoder().encode(ROOT_RELS),
    "3D/3dmodel.model": new TextEncoder().encode(rootModel),
  };
  for (const [path, xml] of Object.entries(objectModels)) {
    files[path] = new TextEncoder().encode(xml);
  }
  for (const [path, content] of Object.entries(extraFiles)) {
    files[path] = new TextEncoder().encode(content);
  }
  const zip = fflate.zipSync(files);
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);
}

describe("parseProductionThreeMF", () => {
  it("resolves a build item that references an object in a separate model part via p:path", () => {
    // The BambuStudio/PrusaSlicer/OrcaSlicer multi-plate pattern: the root
    // model has no mesh objects of its own, only a build item pointing at
    // 3D/Objects/object_1.model, which stock ThreeMFLoader never follows.
    const rootModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
  <resources/>
  <build>
    <item objectid="1" p:path="/3D/Objects/object_1.model" transform="1 0 0 0 1 0 0 0 1 10 20 0"/>
  </build>
</model>`;
    const objectModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2"/>
        </triangles>
      </mesh>
    </object>
  </resources>
</model>`;

    const buffer = buildFixture(rootModel, { "3D/Objects/object_1.model": objectModel });
    const result = parseProductionThreeMF(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const position = result.data.getAttribute("position");
    expect(position.count).toBe(3); // one triangle, non-indexed
    // The build item's transform translates by (10, 20, 0).
    expect(position.getX(0)).toBe(10);
    expect(position.getY(0)).toBe(20);
    expect(position.getZ(0)).toBe(0);
  });

  it("resolves a component with p:path nested inside another object", () => {
    // A component (not just a top-level build item) can also point at a
    // separate model part — verifies the recursive resolve() path, and
    // that a component's transform composes with its parent's.
    const rootModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
  <resources>
    <object id="1" type="model">
      <components>
        <component objectid="1" p:path="/3D/Objects/object_1.model" transform="1 0 0 0 1 0 0 0 1 5 0 0"/>
      </components>
    </object>
  </resources>
  <build>
    <item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 100 0"/>
  </build>
</model>`;
    const objectModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2"/>
        </triangles>
      </mesh>
    </object>
  </resources>
</model>`;

    const buffer = buildFixture(rootModel, { "3D/Objects/object_1.model": objectModel });
    const result = parseProductionThreeMF(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const position = result.data.getAttribute("position");
    expect(position.count).toBe(3);
    // Component translates by (5, 0, 0), build item by (0, 100, 0) — combined (5, 100, 0).
    expect(position.getX(0)).toBe(5);
    expect(position.getY(0)).toBe(100);
    expect(position.getZ(0)).toBe(0);
  });

  it("bakes an object's basematerials displaycolor into a per-vertex color attribute", () => {
    const rootModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
  <resources/>
  <build>
    <item objectid="1" p:path="/3D/Objects/object_1.model"/>
  </build>
</model>`;
    // A two-entry basematerials list; the object references index 1 (green).
    const objectModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="10">
      <base name="Red" displaycolor="#FF0000FF"/>
      <base name="Green" displaycolor="#00FF00FF"/>
    </basematerials>
    <object id="1" type="model" pid="10" pindex="1">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2"/>
        </triangles>
      </mesh>
    </object>
  </resources>
</model>`;

    const buffer = buildFixture(rootModel, { "3D/Objects/object_1.model": objectModel });
    const result = parseProductionThreeMF(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const color = result.data.getAttribute("color");
    expect(color).toBeDefined();
    expect(color.getX(0)).toBe(0);
    expect(color.getY(0)).toBe(1);
    expect(color.getZ(0)).toBe(0);
  });

  it("defaults to white when an object has no material assignment", () => {
    const rootModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
  <resources/>
  <build>
    <item objectid="1" p:path="/3D/Objects/object_1.model"/>
  </build>
</model>`;
    const objectModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2"/>
        </triangles>
      </mesh>
    </object>
  </resources>
</model>`;

    const buffer = buildFixture(rootModel, { "3D/Objects/object_1.model": objectModel });
    const result = parseProductionThreeMF(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const color = result.data.getAttribute("color");
    expect(color.getX(0)).toBe(1);
    expect(color.getY(0)).toBe(1);
    expect(color.getZ(0)).toBe(1);
  });

  it("supports multiple colors within a single object via per-triangle pid/p1/p2/p3", () => {
    // Two triangles in ONE object, each pointing at a different index of
    // the same colorgroup — the object-level pid/pindex (default green)
    // must NOT win here; each triangle's own override should.
    const rootModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
  <resources/>
  <build>
    <item objectid="1" p:path="/3D/Objects/object_1.model"/>
  </build>
</model>`;
    const objectModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="5"><base name="Green" displaycolor="#00FF00FF"/></basematerials>
    <colorgroup id="6">
      <color color="#FF0000FF"/>
      <color color="#0000FFFF"/>
    </colorgroup>
    <object id="1" type="model" pid="5" pindex="0">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="0" y="1" z="0"/>
          <vertex x="2" y="0" z="0"/>
          <vertex x="3" y="0" z="0"/>
          <vertex x="2" y="1" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2" pid="6" p1="0"/>
          <triangle v1="3" v2="4" v3="5" pid="6" p1="1"/>
        </triangles>
      </mesh>
    </object>
  </resources>
</model>`;

    const buffer = buildFixture(rootModel, { "3D/Objects/object_1.model": objectModel });
    const result = parseProductionThreeMF(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const color = result.data.getAttribute("color");
    expect(color.count).toBe(6); // two triangles, non-indexed
    // First triangle's corners: colorgroup index 0 (red).
    expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([1, 0, 0]);
    expect([color.getX(1), color.getY(1), color.getZ(1)]).toEqual([1, 0, 0]);
    // Second triangle's corners: colorgroup index 1 (blue) — different
    // from the first triangle despite being the same object.
    expect([color.getX(3), color.getY(3), color.getZ(3)]).toEqual([0, 0, 1]);
    expect([color.getX(4), color.getY(4), color.getZ(4)]).toEqual([0, 0, 1]);
  });

  it("blends per-corner colorgroup indices across a single triangle (p1/p2/p3 differ)", () => {
    const rootModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
  <resources/>
  <build>
    <item objectid="1" p:path="/3D/Objects/object_1.model"/>
  </build>
</model>`;
    const objectModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <colorgroup id="6">
      <color color="#FF0000FF"/>
      <color color="#00FF00FF"/>
      <color color="#0000FFFF"/>
    </colorgroup>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2" pid="6" p1="0" p2="1" p3="2"/>
        </triangles>
      </mesh>
    </object>
  </resources>
</model>`;

    const buffer = buildFixture(rootModel, { "3D/Objects/object_1.model": objectModel });
    const result = parseProductionThreeMF(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const color = result.data.getAttribute("color");
    expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([1, 0, 0]); // corner 1: red
    expect([color.getX(1), color.getY(1), color.getZ(1)]).toEqual([0, 1, 0]); // corner 2: green
    expect([color.getX(2), color.getY(2), color.getZ(2)]).toEqual([0, 0, 1]); // corner 3: blue
  });

  it("falls back to BambuStudio project-config color when no spec-native color exists", () => {
    // Reproduces a real BambuStudio export: no <basematerials>, no
    // <colorgroup>, no pid anywhere in the 3MF resources — the color the
    // slicer actually shows lives entirely in the non-spec
    // Metadata/model_settings.config (object id -> extruder) and
    // Metadata/project_settings.config (extruder -> filament_colour).
    const rootModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
  <resources>
    <object id="2" type="model">
      <components>
        <component p:path="/3D/Objects/object_2.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
      </components>
    </object>
  </resources>
  <build>
    <item objectid="2" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
  </build>
</model>`;
    const objectModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
      </mesh>
    </object>
  </resources>
</model>`;
    const modelSettings = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="2">
    <metadata key="name" value="Part"/>
    <metadata key="extruder" value="1"/>
  </object>
</config>`;
    const projectSettings = JSON.stringify({ filament_colour: ["#893044"] });

    const buffer = buildFixture(
      rootModel,
      { "3D/Objects/object_2.model": objectModel },
      {
        "Metadata/model_settings.config": modelSettings,
        "Metadata/project_settings.config": projectSettings,
      },
    );
    const result = parseProductionThreeMF(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const color = result.data.getAttribute("color");
    // #893044 -> (137, 48, 68) / 255
    expect(color.getX(0)).toBeCloseTo(137 / 255, 4);
    expect(color.getY(0)).toBeCloseTo(48 / 255, 4);
    expect(color.getZ(0)).toBeCloseTo(68 / 255, 4);
  });

  it("does not let BambuStudio fallback color override a real spec-native color", () => {
    const rootModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
  <resources/>
  <build>
    <item objectid="1" p:path="/3D/Objects/object_1.model"/>
  </build>
</model>`;
    const objectModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="9"><base name="Green" displaycolor="#00FF00FF"/></basematerials>
    <object id="1" type="model" pid="9" pindex="0">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
      </mesh>
    </object>
  </resources>
</model>`;
    const modelSettings = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1">
    <metadata key="extruder" value="1"/>
  </object>
</config>`;
    const projectSettings = JSON.stringify({ filament_colour: ["#893044"] });

    const buffer = buildFixture(
      rootModel,
      { "3D/Objects/object_1.model": objectModel },
      {
        "Metadata/model_settings.config": modelSettings,
        "Metadata/project_settings.config": projectSettings,
      },
    );
    const result = parseProductionThreeMF(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const color = result.data.getAttribute("color");
    expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([0, 1, 0]); // still green, not #893044
  });

  it("returns an error rather than throwing when a referenced object truly doesn't exist", () => {
    const rootModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
  <resources/>
  <build>
    <item objectid="99" p:path="/3D/Objects/object_1.model"/>
  </build>
</model>`;
    const objectModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices>
        <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
      </mesh>
    </object>
  </resources>
</model>`;

    const buffer = buildFixture(rootModel, { "3D/Objects/object_1.model": objectModel });
    const result = parseProductionThreeMF(buffer);

    expect(result.success).toBe(false);
  });
});
