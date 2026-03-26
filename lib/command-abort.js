export function buildAbortError(source, fallbackMessage = "Operacion cancelada.") {
  const reason =
    source && typeof source === "object" && "aborted" in source ? source.reason : source;

  if (reason instanceof Error) {
    return reason;
  }

  const message = String(reason?.message || reason || fallbackMessage).trim() || fallbackMessage;
  const error = new Error(message);
  error.code = String(reason?.code || "TASK_ABORTED").trim() || "TASK_ABORTED";
  return error;
}

export function throwIfAborted(signal, fallbackMessage = "Operacion cancelada.") {
  if (signal?.aborted) {
    throw buildAbortError(signal, fallbackMessage);
  }
}

export function bindAbort(signal, handler) {
  if (!signal || typeof handler !== "function") {
    return () => {};
  }

  if (signal.aborted) {
    try {
      handler(signal.reason);
    } catch {}
    return () => {};
  }

  const onAbort = () => {
    try {
      handler(signal.reason);
    } catch {}
  };

  signal.addEventListener?.("abort", onAbort, { once: true });
  return () => {
    try {
      signal.removeEventListener?.("abort", onAbort);
    } catch {}
  };
}
