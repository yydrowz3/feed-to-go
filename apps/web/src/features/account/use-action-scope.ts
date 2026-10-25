import { useEffect, useRef } from "react";
import { useRuntime } from "../../lib/app-context";

export function useActionScope() {
  const runtime = useRuntime();
  const ref = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    ref.current = controller;
    const release = runtime.registerSessionTask(() => controller.abort());
    return () => {
      controller.abort();
      release();
    };
  }, [runtime]);
  return () => {
    const signal = ref.current?.signal;
    if (!signal) throw new DOMException("errors.pageClosed", "AbortError");
    signal.throwIfAborted();
    return signal;
  };
}
