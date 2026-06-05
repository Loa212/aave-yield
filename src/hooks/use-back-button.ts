import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { backButton } from "@/lib/telegram";

/**
 * Show the Telegram BackButton on a sub-route and wire it to navigate home.
 * No-op outside Telegram. Hides + unbinds on unmount.
 */
export function useBackButton(to = "/") {
  const navigate = useNavigate();

  useEffect(() => {
    let off: (() => void) | undefined;
    try {
      if (backButton.show.isAvailable()) {
        backButton.show();
        off = backButton.onClick(() => navigate({ to }));
      }
    } catch {
      /* outside Telegram */
    }
    return () => {
      try {
        off?.();
        if (backButton.hide.isAvailable()) backButton.hide();
      } catch {
        /* ignore */
      }
    };
  }, [navigate, to]);
}
