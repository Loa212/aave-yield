import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastApi {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Minimal toast system — no extra dependency. Auto-dismisses after 4s. Used for
 * transient errors that don't belong inline (e.g. a quote fetch failing).
 */
export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, message, variant }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur",
              t.variant === "error" &&
                "border-destructive/40 bg-destructive/15 text-destructive-foreground",
              t.variant === "success" &&
                "border-success/40 bg-success/15 text-foreground",
              t.variant === "info" && "border-border bg-card text-foreground",
            )}
          >
            <ToastIcon variant={t.variant} />
            <span className="flex-1 text-left">{t.message}</span>
            <X className="h-3.5 w-3.5 opacity-60" />
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "error")
    return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />;
  if (variant === "success")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />;
  return <Info className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
