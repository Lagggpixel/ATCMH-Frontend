import {useEffect, useLayoutEffect, useState} from "react";
import {scopePreferenceWriter, type ScopePreferences} from "./scope-preferences";

export function useSaveScopePreferences(key: string | undefined, preferences: ScopePreferences) {
  // Scope remounts when its account/station key changes, keeping pending writes with their owner.
  const [writer] = useState(() => scopePreferenceWriter(key));
  useLayoutEffect(() => {writer.update(preferences);}, [writer, preferences]);
  useEffect(() => {
    const hidden = () => {if (document.visibilityState === "hidden") writer.flush();};
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", writer.flush);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", writer.flush);
      writer.flush();
    };
  }, [writer]);
}
