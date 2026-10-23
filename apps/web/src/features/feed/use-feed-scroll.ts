import { useCallback, useEffect, useRef, useState } from "react";
export function useFeedScroll(count: number) {
  const scroller = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  const index = Math.min(position, Math.max(0, count - 1));
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (element.clientHeight)
          setPosition(
            Math.max(0, Math.min(count - 1, Math.round(element.scrollTop / element.clientHeight))),
          );
      });
    };
    const observer = new ResizeObserver(() => {
      element.scrollTop = indexRef.current * element.clientHeight;
    });
    observer.observe(element);
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [count]);
  const move = useCallback(
    (delta: number) => {
      const element = scroller.current;
      if (element)
        element.scrollTo({
          top: Math.max(0, Math.min(count - 1, index + delta)) * element.clientHeight,
          behavior: "smooth",
        });
    },
    [index, count],
  );
  const reset = () => {
    setPosition(0);
    if (scroller.current) scroller.current.scrollTop = 0;
  };
  return { scroller, index, move, reset };
}
