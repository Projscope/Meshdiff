import { Text } from "@react-three/drei";

const AXIS_LENGTH = 30;

// drei's <Html> (a DOM overlay positioned via useFrame) doesn't render in
// this app's Canvas setup — <Text> (troika-three-text, real WebGL geometry
// via drei) is used instead so the labels are part of the actual scene.
const AXES: Array<{ letter: string; position: [number, number, number]; color: string }> = [
  { letter: "X", position: [AXIS_LENGTH, 0, 0], color: "#f87171" },
  { letter: "Y", position: [0, AXIS_LENGTH, 0], color: "#4ade80" },
  { letter: "Z", position: [0, 0, AXIS_LENGTH], color: "#60a5fa" },
];

/** Floating X/Y/Z labels at the tip of each axesHelper line, matching its
 * fixed red/green/blue color convention. Renders inside a <Canvas>. */
export default function AxisLabels() {
  return AXES.map(({ letter, position, color }) => (
    <Text key={letter} position={position} fontSize={4} color={color} anchorX="center" anchorY="middle">
      {letter}
    </Text>
  ));
}
