import * as fs from 'fs';

// Create a simple binary STL file
function writeSTL(filename, triangles) {
  const buffer = Buffer.alloc(84 + triangles.length * 50);

  // Header (80 bytes)
  buffer.write('Binary STL file generated', 0);

  // Number of triangles (4 bytes, little-endian)
  buffer.writeUInt32LE(triangles.length, 80);

  // Write triangles
  triangles.forEach((tri, index) => {
    const offset = 84 + index * 50;

    // Normal vector (12 bytes)
    buffer.writeFloatLE(tri.normal[0], offset);
    buffer.writeFloatLE(tri.normal[1], offset + 4);
    buffer.writeFloatLE(tri.normal[2], offset + 8);

    // Vertex 1 (12 bytes)
    buffer.writeFloatLE(tri.v1[0], offset + 12);
    buffer.writeFloatLE(tri.v1[1], offset + 16);
    buffer.writeFloatLE(tri.v1[2], offset + 20);

    // Vertex 2 (12 bytes)
    buffer.writeFloatLE(tri.v2[0], offset + 24);
    buffer.writeFloatLE(tri.v2[1], offset + 28);
    buffer.writeFloatLE(tri.v2[2], offset + 32);

    // Vertex 3 (12 bytes)
    buffer.writeFloatLE(tri.v3[0], offset + 36);
    buffer.writeFloatLE(tri.v3[1], offset + 40);
    buffer.writeFloatLE(tri.v3[2], offset + 44);

    // Attribute byte count (2 bytes)
    buffer.writeUInt16LE(0, offset + 48);
  });

  fs.writeFileSync(filename, buffer);
}

// Generate a complex bracket model v1
function generateBracketV1() {
  const triangles = [];

  // Main base block (20x10x5)
  const addBox = (x, y, z, w, h, d, normal) => {
    const vertices = [
      [x, y, z], [x+w, y, z], [x+w, y+h, z], [x, y+h, z],
      [x, y, z+d], [x+w, y, z+d], [x+w, y+h, z+d], [x, y+h, z+d]
    ];

    // Bottom
    triangles.push({ normal: [0, 0, -1], v1: vertices[0], v2: vertices[1], v3: vertices[2] });
    triangles.push({ normal: [0, 0, -1], v1: vertices[0], v2: vertices[2], v3: vertices[3] });

    // Top
    triangles.push({ normal: [0, 0, 1], v1: vertices[4], v2: vertices[6], v3: vertices[5] });
    triangles.push({ normal: [0, 0, 1], v1: vertices[4], v2: vertices[7], v3: vertices[6] });

    // Front
    triangles.push({ normal: [0, -1, 0], v1: vertices[0], v2: vertices[5], v3: vertices[1] });
    triangles.push({ normal: [0, -1, 0], v1: vertices[0], v2: vertices[4], v3: vertices[5] });

    // Back
    triangles.push({ normal: [0, 1, 0], v1: vertices[2], v2: vertices[7], v3: vertices[3] });
    triangles.push({ normal: [0, 1, 0], v1: vertices[2], v2: vertices[6], v3: vertices[7] });

    // Left
    triangles.push({ normal: [-1, 0, 0], v1: vertices[3], v2: vertices[4], v3: vertices[0] });
    triangles.push({ normal: [-1, 0, 0], v1: vertices[3], v2: vertices[7], v3: vertices[4] });

    // Right
    triangles.push({ normal: [1, 0, 0], v1: vertices[1], v2: vertices[6], v3: vertices[2] });
    triangles.push({ normal: [1, 0, 0], v1: vertices[1], v2: vertices[5], v3: vertices[6] });
  };

  // Base
  addBox(0, 0, 0, 20, 10, 5);

  // Left column
  addBox(2, 2, 5, 3, 3, 8);

  // Right column
  addBox(15, 2, 5, 3, 3, 8);

  // Top bridge
  addBox(2, 4, 12, 16, 2, 2);

  // Center boss
  addBox(8, 3, 5, 4, 4, 5);

  // Ribs
  for (let i = 0; i < 3; i++) {
    addBox(4 + i * 4, 1, 5, 1, 8, 3);
  }

  return triangles;
}

// Generate a complex bracket model v2 (modified version)
function generateBracketV2() {
  const triangles = [];

  const addBox = (x, y, z, w, h, d) => {
    const vertices = [
      [x, y, z], [x+w, y, z], [x+w, y+h, z], [x, y+h, z],
      [x, y, z+d], [x+w, y, z+d], [x+w, y+h, z+d], [x, y+h, z+d]
    ];

    triangles.push({ normal: [0, 0, -1], v1: vertices[0], v2: vertices[1], v3: vertices[2] });
    triangles.push({ normal: [0, 0, -1], v1: vertices[0], v2: vertices[2], v3: vertices[3] });
    triangles.push({ normal: [0, 0, 1], v1: vertices[4], v2: vertices[6], v3: vertices[5] });
    triangles.push({ normal: [0, 0, 1], v1: vertices[4], v2: vertices[7], v3: vertices[6] });
    triangles.push({ normal: [0, -1, 0], v1: vertices[0], v2: vertices[5], v3: vertices[1] });
    triangles.push({ normal: [0, -1, 0], v1: vertices[0], v2: vertices[4], v3: vertices[5] });
    triangles.push({ normal: [0, 1, 0], v1: vertices[2], v2: vertices[7], v3: vertices[3] });
    triangles.push({ normal: [0, 1, 0], v1: vertices[2], v2: vertices[6], v3: vertices[7] });
    triangles.push({ normal: [-1, 0, 0], v1: vertices[3], v2: vertices[4], v3: vertices[0] });
    triangles.push({ normal: [-1, 0, 0], v1: vertices[3], v2: vertices[7], v3: vertices[4] });
    triangles.push({ normal: [1, 0, 0], v1: vertices[1], v2: vertices[6], v3: vertices[2] });
    triangles.push({ normal: [1, 0, 0], v1: vertices[1], v2: vertices[5], v3: vertices[6] });
  };

  // Larger base
  addBox(0, 0, 0, 22, 12, 5);

  // Taller left column
  addBox(2, 2, 5, 3, 3, 10);

  // Taller right column
  addBox(17, 2, 5, 3, 3, 10);

  // Top bridge (higher)
  addBox(2, 4, 14, 18, 2, 2);

  // Larger center boss with hole indication
  addBox(8, 2, 5, 6, 8, 6);

  // More ribs
  for (let i = 0; i < 4; i++) {
    addBox(3 + i * 4, 1, 5, 1, 10, 3);
  }

  // Additional mounting features
  addBox(1, 9, 2, 2, 2, 2);
  addBox(19, 9, 2, 2, 2, 2);

  return triangles;
}

// Generate gear model v1
function generateGearV1() {
  const triangles = [];

  const addBox = (x, y, z, w, h, d) => {
    const vertices = [
      [x, y, z], [x+w, y, z], [x+w, y+h, z], [x, y+h, z],
      [x, y, z+d], [x+w, y, z+d], [x+w, y+h, z+d], [x, y+h, z+d]
    ];

    triangles.push({ normal: [0, 0, -1], v1: vertices[0], v2: vertices[1], v3: vertices[2] });
    triangles.push({ normal: [0, 0, -1], v1: vertices[0], v2: vertices[2], v3: vertices[3] });
    triangles.push({ normal: [0, 0, 1], v1: vertices[4], v2: vertices[6], v3: vertices[5] });
    triangles.push({ normal: [0, 0, 1], v1: vertices[4], v2: vertices[7], v3: vertices[6] });
    triangles.push({ normal: [0, -1, 0], v1: vertices[0], v2: vertices[5], v3: vertices[1] });
    triangles.push({ normal: [0, -1, 0], v1: vertices[0], v2: vertices[4], v3: vertices[5] });
    triangles.push({ normal: [0, 1, 0], v1: vertices[2], v2: vertices[7], v3: vertices[3] });
    triangles.push({ normal: [0, 1, 0], v1: vertices[2], v2: vertices[6], v3: vertices[7] });
    triangles.push({ normal: [-1, 0, 0], v1: vertices[3], v2: vertices[4], v3: vertices[0] });
    triangles.push({ normal: [-1, 0, 0], v1: vertices[3], v2: vertices[7], v3: vertices[4] });
    triangles.push({ normal: [1, 0, 0], v1: vertices[1], v2: vertices[6], v3: vertices[2] });
    triangles.push({ normal: [1, 0, 0], v1: vertices[1], v2: vertices[5], v3: vertices[6] });
  };

  // Central hub
  addBox(7, 7, 0, 6, 6, 3);

  // Teeth pattern
  const teeth = 8;
  for (let i = 0; i < teeth; i++) {
    const angle = (i / teeth) * Math.PI * 2;
    const x = 10 + Math.cos(angle) * 6;
    const y = 10 + Math.sin(angle) * 6;
    addBox(x - 0.8, y - 0.8, 0, 1.6, 1.6, 4);
  }

  return triangles;
}

// Generate gear model v2
function generateGearV2() {
  const triangles = [];

  const addBox = (x, y, z, w, h, d) => {
    const vertices = [
      [x, y, z], [x+w, y, z], [x+w, y+h, z], [x, y+h, z],
      [x, y, z+d], [x+w, y, z+d], [x+w, y+h, z+d], [x, y+h, z+d]
    ];

    triangles.push({ normal: [0, 0, -1], v1: vertices[0], v2: vertices[1], v3: vertices[2] });
    triangles.push({ normal: [0, 0, -1], v1: vertices[0], v2: vertices[2], v3: vertices[3] });
    triangles.push({ normal: [0, 0, 1], v1: vertices[4], v2: vertices[6], v3: vertices[5] });
    triangles.push({ normal: [0, 0, 1], v1: vertices[4], v2: vertices[7], v3: vertices[6] });
    triangles.push({ normal: [0, -1, 0], v1: vertices[0], v2: vertices[5], v3: vertices[1] });
    triangles.push({ normal: [0, -1, 0], v1: vertices[0], v2: vertices[4], v3: vertices[5] });
    triangles.push({ normal: [0, 1, 0], v1: vertices[2], v2: vertices[7], v3: vertices[3] });
    triangles.push({ normal: [0, 1, 0], v1: vertices[2], v2: vertices[6], v3: vertices[7] });
    triangles.push({ normal: [-1, 0, 0], v1: vertices[3], v2: vertices[4], v3: vertices[0] });
    triangles.push({ normal: [-1, 0, 0], v1: vertices[3], v2: vertices[7], v3: vertices[4] });
    triangles.push({ normal: [1, 0, 0], v1: vertices[1], v2: vertices[6], v3: vertices[2] });
    triangles.push({ normal: [1, 0, 0], v1: vertices[1], v2: vertices[5], v3: vertices[6] });
  };

  // Larger central hub
  addBox(6, 6, 0, 8, 8, 4);

  // More teeth
  const teeth = 12;
  for (let i = 0; i < teeth; i++) {
    const angle = (i / teeth) * Math.PI * 2;
    const x = 10 + Math.cos(angle) * 7;
    const y = 10 + Math.sin(angle) * 7;
    addBox(x - 0.7, y - 0.7, 0, 1.4, 1.4, 4.5);
  }

  return triangles;
}

// Generate and save
console.log('Generating bracket demo models...');
writeSTL('apps/web/public/demo/bracket-v1.stl', generateBracketV1());
writeSTL('apps/web/public/demo/bracket-v2.stl', generateBracketV2());

console.log('Generating gear demo models...');
writeSTL('apps/web/public/demo/gear-v1.stl', generateGearV1());
writeSTL('apps/web/public/demo/gear-v2.stl', generateGearV2());

console.log('Demo files generated successfully!');
