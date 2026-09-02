import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const HERO_SEEN_KEY = "masether-hero-v2";

export function HeroSplash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const finished = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    try {
      sessionStorage.setItem(HERO_SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
    setLeaving(true);
    window.setTimeout(() => onDoneRef.current(), 160);
  };

  useEffect(() => {
    const t = window.setTimeout(finish, 4000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[120] bg-bg transition-opacity duration-150 ease-out",
        leaving && "opacity-0",
      )}
      role="dialog"
      aria-label="MaSether Ops Floor"
      aria-modal="true"
    >
      <div className="absolute inset-0 flex items-center justify-center bg-bg px-3 pt-3 pb-16 sm:p-8">
        <div
          className="relative max-h-full max-w-full"
          style={{
            width: "min(100%, calc((100dvh - 5.5rem) * 16 / 9))",
            aspectRatio: "16 / 9",
          }}
        >
          <video
            className="absolute inset-0 h-full w-full object-contain"
            width={1280}
            height={720}
            src="/hero.mp4"
            poster="/hero-poster.jpg"
            autoPlay
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            onEnded={finish}
            onError={finish}
          />
          <img
            src="/title-lockup.png"
            alt=""
            className="pointer-events-none absolute top-[52%] left-1/2 w-[70%] -translate-x-1/2 -translate-y-1/2 object-contain"
          />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="absolute right-3 bottom-3 z-10 min-h-11 min-w-11 sm:right-4 sm:bottom-4"
        onClick={finish}
      >
        Open desk
      </Button>
    </div>
  );
}
