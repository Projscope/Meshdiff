import { useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useControlScheme, useOrbitMouseButtons } from "../lib/controlScheme";

interface CameraSyncProps {
  syncedCameraState: { position: [number, number, number]; target: [number, number, number] } | undefined;
  onCameraChange: ((state: { position: [number, number, number]; target: [number, number, number] }) => void) | undefined;
  isSyncEnabled: boolean;
  zoomSpeed?: number;
  rotateSpeed?: number;
  onControlsReady?: (controls: any) => void;
}

/**
 * Drives OrbitControls plus the rotation-vs-zoom detection heuristic used to
 * decide when it's safe to apply a synced camera pose without fighting the
 * user's own in-progress drag. Shared by Viewer.tsx and DiffView.tsx — the
 * only two viewers with a sync feature at all; ReadOnlyMeshViewer.tsx and
 * MeasureViewer.tsx use a plain OrbitControls with no sync logic and don't
 * need this.
 */
export default function CameraSync({
  syncedCameraState,
  onCameraChange,
  isSyncEnabled,
  zoomSpeed = 1,
  rotateSpeed = 1,
  onControlsReady,
}: CameraSyncProps) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const readyRef = useRef(false);
  const [controlScheme] = useControlScheme();
  const mouseButtons = useOrbitMouseButtons(controlScheme);
  const frameCountRef = useRef(0);
  const lastPosRef = useRef(new THREE.Vector3());
  const lastTargetRef = useRef(new THREE.Vector3());
  const lastLocalPosRef = useRef(new THREE.Vector3());
  const userInteractingRef = useRef(false);
  const interactionCooldownRef = useRef(0);
  const idleFramesRef = useRef(0);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls?.target) return;

    // Set speeds every frame (safer than useEffect in R3F)
    controls.zoomSpeed = zoomSpeed;
    controls.rotateSpeed = rotateSpeed;

    // Call onControlsReady once
    if (!readyRef.current) {
      readyRef.current = true;
      lastPosRef.current.copy(camera.position);
      lastTargetRef.current.copy(controls.target);
      lastLocalPosRef.current.copy(camera.position);
      onControlsReady?.(controls);
    }

    // Only do sync logic if sync is enabled
    if (!isSyncEnabled) return;

    frameCountRef.current++;

    // Skip sync for first 60 frames (model loading phase to avoid shake)
    const isLoading = frameCountRef.current < 60;

    // Detect if user is actively rotating (not zooming)
    // Zoom = distance from camera to target changed significantly
    // Rotation = camera moved but distance to target stayed roughly same
    const curDist = camera.position.distanceTo(controls.target);
    const lastDist = lastLocalPosRef.current.distanceTo(controls.target);
    const distanceChange = Math.abs(curDist - lastDist);
    const positionMovement = camera.position.distanceTo(lastLocalPosRef.current);

    // If distance changed a lot, it's zoom - don't block sync
    // If position moved but distance didn't change much, it's rotation - block sync
    if (positionMovement > 0.5 && distanceChange < 0.15) {
      userInteractingRef.current = true;
      interactionCooldownRef.current = 15;
      idleFramesRef.current = 0;
    }
    if (interactionCooldownRef.current > 0) {
      interactionCooldownRef.current--;
    } else {
      userInteractingRef.current = false;
    }

    // Track idle frames (no user interaction)
    if (!userInteractingRef.current && positionMovement < 0.01) {
      idleFramesRef.current++;
    } else {
      idleFramesRef.current = 0;
    }
    lastLocalPosRef.current.copy(camera.position);

    // Broadcast local changes every frame
    const curPos = camera.position;
    const curTarget = controls.target;

    const posChanged = !curPos.equals(lastPosRef.current);
    const targetChanged = !curTarget.equals(lastTargetRef.current);

    if (posChanged || targetChanged) {
      lastPosRef.current.copy(curPos);
      lastTargetRef.current.copy(curTarget);

      onCameraChange?.({
        position: curPos.toArray() as [number, number, number],
        target: curTarget.toArray() as [number, number, number],
      });
    }

    // Apply synced state: skip during loading, during rotation, and until truly idle (5+ idle frames)
    if (syncedCameraState && !isLoading && !userInteractingRef.current && idleFramesRef.current >= 5 && frameCountRef.current % 2 === 0) {
      camera.position.set(...syncedCameraState.position);
      controls.target.set(...syncedCameraState.target);
      controls.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableZoom={true}
      enablePan={true}
      enableRotate={true}
      autoRotate={false}
      mouseButtons={mouseButtons}
    />
  );
}
