import * as THREE from "three";

const THUMBNAIL_SIZE = 512;
const MESH_COLOR = 0x4f8ff7;

/**
 * Renders a single isometric-ish snapshot of a mesh to a PNG blob, entirely
 * offscreen (no mounted <canvas>, no React Three Fiber) — used to generate
 * project list thumbnails right after a version upload, from the same File
 * object already loaded client-side for the upload.
 */
export async function renderMeshThumbnail(geometry: THREE.BufferGeometry): Promise<Blob | null> {
  geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere;
  if (!sphere || sphere.radius === 0) return null;
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();

  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, false);

  try {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ color: MESH_COLOR, metalness: 0.1, roughness: 0.6 });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(1, 1.6, 1);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
    fillLight.position.set(-1, -0.4, -1);
    scene.add(fillLight);

    const camera = new THREE.PerspectiveCamera(35, 1, sphere.radius / 100, sphere.radius * 100);
    const distance = (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.5;
    const direction = new THREE.Vector3(1, 0.8, 1).normalize();
    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    camera.lookAt(sphere.center);

    renderer.render(scene, camera);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/png");
    });

    material.dispose();
    return blob;
  } finally {
    renderer.dispose();
  }
}
