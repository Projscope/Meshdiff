import { useMemo } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { IS_DESKTOP } from "../lib/runtime";

const AXIS_LENGTH = 30;

// drei's <Html> (a DOM overlay positioned via useFrame) doesn't render in
// this app's Canvas setup — <Text> (troika-three-text, real WebGL geometry
// via drei) is used instead so the labels are part of the actual scene.
const AXES: Array<{ letter: string; position: [number, number, number]; color: string }> = [
  { letter: "X", position: [AXIS_LENGTH, 0, 0], color: "#f87171" },
  { letter: "Y", position: [0, AXIS_LENGTH, 0], color: "#4ade80" },
  { letter: "Z", position: [0, 0, AXIS_LENGTH], color: "#60a5fa" },
];

// troika's default font is fetched from a CDN at runtime, which the desktop
// app's CSP forbids (and which can't work offline). Draw the letter to a
// canvas instead — no font file, no network.
function LetterSprite({ letter, position, color }: { letter: string; position: [number, number, number]; color: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.font = "bold 96px sans-serif";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(letter, 64, 68);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [letter, color]);

  return (
    <sprite position={position} scale={[5, 5, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

/** Floating X/Y/Z labels at the tip of each axesHelper line, matching its
 * fixed red/green/blue color convention. Renders inside a <Canvas>. */
export default function AxisLabels() {
  return AXES.map(({ letter, position, color }) =>
    IS_DESKTOP ? (
      <LetterSprite key={letter} letter={letter} position={position} color={color} />
    ) : (
      <Text key={letter} position={position} fontSize={4} color={color} anchorX="center" anchorY="middle">
        {letter}
      </Text>
    ),
  );
}
