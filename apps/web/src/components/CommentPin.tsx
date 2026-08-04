import { Html } from "@react-three/drei";

interface CommentPinProps {
  position: [number, number, number];
  label?: string;
  pending?: boolean;
}

export default function CommentPin({ position, label, pending }: CommentPinProps) {
  return (
    <Html position={position} center distanceFactor={40} occlude={false}>
      <div
        className={`flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border text-[10px] shadow ${
          pending
            ? "border-indigo-400 bg-indigo-500 text-white"
            : "border-red-400 bg-red-500 text-white"
        }`}
        title={label}
      >
        📍
      </div>
    </Html>
  );
}
