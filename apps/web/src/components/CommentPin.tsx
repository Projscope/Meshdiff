import { Html } from "@react-three/drei";

interface CommentPinProps {
  position: [number, number, number];
  label?: string;
  pending?: boolean;
  highlighted?: boolean;
  onHoverChange?: (hovering: boolean) => void;
  /** Only meaningful when pending — starts a drag to reposition before submit. */
  onDragStart?: () => void;
  /** Only meaningful when not pending — pins the comment popover open. */
  onSelect?: () => void;
}

export default function CommentPin({
  position,
  label,
  pending,
  highlighted,
  onHoverChange,
  onDragStart,
  onSelect,
}: CommentPinProps) {
  return (
    <Html position={position} center distanceFactor={40} occlude={false}>
      <div
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
        onClick={
          !pending && onSelect
            ? (event) => {
                event.stopPropagation();
                onSelect();
              }
            : undefined
        }
        onMouseDown={
          pending && onDragStart
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onDragStart();
              }
            : undefined
        }
        className={`flex items-center justify-center rounded-full border text-[10px] shadow transition-all ${
          highlighted ? "h-6 w-6 -translate-y-1/2 ring-2 ring-white" : "h-5 w-5 -translate-y-1/2"
        } ${pending && onDragStart ? "cursor-grab active:cursor-grabbing" : !pending && onSelect ? "cursor-pointer" : ""} ${
          pending
            ? "border-indigo-400 bg-indigo-500 text-white"
            : highlighted
              ? "border-red-300 bg-red-400 text-white"
              : "border-red-400 bg-red-500 text-white"
        }`}
        title={pending ? "Drag to reposition" : label}
      >
        📍
      </div>
    </Html>
  );
}
