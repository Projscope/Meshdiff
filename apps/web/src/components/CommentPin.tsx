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
  /** Total messages in this thread (comment + its replies). A badge only
   * shows once there's an actual conversation (count > 1) — a lone comment
   * doesn't need a "1" cluttering every pin. */
  messageCount?: number;
}

export default function CommentPin({
  position,
  label,
  pending,
  highlighted,
  onHoverChange,
  onDragStart,
  onSelect,
  messageCount,
}: CommentPinProps) {
  return (
    <Html position={position} center distanceFactor={40} occlude={false}>
      <div className="relative inline-flex -translate-y-1/2">
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
            highlighted ? "h-6 w-6 ring-2 ring-white" : "h-5 w-5"
          } ${pending && onDragStart ? "cursor-grab active:cursor-grabbing" : !pending && onSelect ? "cursor-pointer" : ""} ${
            pending
              ? "border-indigo-400 bg-indigo-500 text-ink-50"
              : highlighted
                ? "border-red-300 bg-red-400 text-ink-50"
                : "border-red-400 bg-red-500 text-ink-50"
          }`}
          title={pending ? "Drag to reposition" : label}
        >
          📍
        </div>
        {!pending && messageCount !== undefined && messageCount > 1 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-ink-950 bg-white px-1 text-[9px] font-bold leading-none text-red-600">
            {messageCount}
          </span>
        )}
      </div>
    </Html>
  );
}
