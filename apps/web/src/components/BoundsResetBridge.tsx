import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";

interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
}

/**
 * Bridges an imperative resetView() call (from outside the R3F tree) back
 * to the camera pose the scene actually loaded with.
 *
 * Not the same as calling drei's Bounds.fit() directly — fit() delegates to
 * Bounds' internal reset(), which re-derives the camera position along
 * whatever direction the camera is CURRENTLY facing (camera.position minus
 * box center), so after a user rotates the view it just re-frames at the
 * new angle instead of restoring the original one. This instead waits for
 * <Bounds>'s own initial fit animation to settle (detected by camera
 * position going still for a few frames, since maxDuration is
 * configurable) and snapshots that as the "loaded" pose to restore to.
 *
 * Must render as a child of <Bounds>, and should be given a `key` tied to
 * the loaded geometry (e.g. geometry.uuid) by the caller so it remounts —
 * and re-captures — whenever a genuinely new model loads.
 */
export default function BoundsResetBridge({ resetRef }: { resetRef: MutableRefObject<(() => void) | null> }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as ControlsLike | null;

  const capturedRef = useRef(false);
  const initialPos = useRef(new THREE.Vector3());
  const initialTarget = useRef(new THREE.Vector3());
  const lastPos = useRef(new THREE.Vector3());
  const stableFrames = useRef(0);

  useEffect(() => {
    resetRef.current = () => {
      if (!capturedRef.current) return;
      camera.position.copy(initialPos.current);
      camera.updateProjectionMatrix();
      if (controls) {
        controls.target.copy(initialTarget.current);
        controls.update();
      }
    };
  }, [camera, controls, resetRef]);

  useFrame(() => {
    if (capturedRef.current) return;
    if (camera.position.distanceTo(lastPos.current) < 0.001) {
      stableFrames.current++;
      if (stableFrames.current >= 5) {
        initialPos.current.copy(camera.position);
        if (controls) initialTarget.current.copy(controls.target);
        capturedRef.current = true;
      }
    } else {
      stableFrames.current = 0;
    }
    lastPos.current.copy(camera.position);
  });

  return null;
}
