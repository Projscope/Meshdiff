import * as THREE from "three";

/**
 * Copies (not transfers) a geometry's index buffer for sending to a Web
 * Worker. .slice() rather than a structured-clone transfer, because the
 * source geometry is also used for on-screen rendering elsewhere — a
 * transfer would detach its buffer and break that.
 */
export function toIndexArray(geometry: THREE.BufferGeometry): Uint32Array | Uint16Array | null {
  const index = geometry.getIndex();
  if (!index) return null;
  const array = index.array;
  return array instanceof Uint16Array ? array.slice() : Uint32Array.from(array);
}
