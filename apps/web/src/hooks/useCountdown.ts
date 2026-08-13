import { useEffect, useState } from "react";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Returns a live "Xd hh:mm:ss" (or "hh:mm:ss" once under a day) countdown to
 * `target`, ticking every second. Once `target` has passed, holds at
 * "00:00:00" — callers can compare against `target` themselves if they need
 * to hide something on expiry. */
export function useCountdown(target: Date): string {
  const [remainingMs, setRemainingMs] = useState(() => target.getTime() - Date.now());

  useEffect(() => {
    const tick = () => setRemainingMs(Math.max(0, target.getTime() - Date.now()));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [target]);

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}
