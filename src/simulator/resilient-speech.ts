import type {SpeechOutput} from "./radio-audio";

/** Bound preparation, not transmission length. A failed generator falls back to
 * device-local speech during recovery; no radio text is sent to a new provider. */
export function resilientSpeechOutput(primary: SpeechOutput | null, fallback: SpeechOutput | null, preparationMs = 8000): SpeechOutput | null {
  if (!primary) return fallback;
  let failed = false, retryAt = 0, failedVoice = "", serial = 0, timer: ReturnType<typeof setTimeout> | undefined;
  let status: (text: string) => void = () => {};
  const clear = () => {clearTimeout(timer); timer = undefined;};
  const unsubscribe = primary.onStatusChanged?.(text => {
    if (text && !/prepar|load|download/i.test(text)) clear();
    status(text);
  });
  return {
    voices: () => primary.voices(),
    onVoicesChanged: listener => primary.onVoicesChanged(listener),
    onStatusChanged: listener => {status = listener; return () => {status = () => {};};},
    activate: () => {primary.activate?.(); fallback?.activate?.();},
    warm: () => primary.warm?.(),
    prepare: (text, settings) => {if (!failed) primary.prepare?.(text, settings);},
    prepareDraft: (text, settings) => {if (!failed) primary.prepareDraft?.(text, settings);},
    cancelDraft: () => primary.cancelDraft?.(),
    speak(text, settings, end, error) {
      clear(); const current = ++serial;
      const finish = (callback: () => void) => {if (current === serial) {clear(); serial++; callback();}};
      const recover = () => {
        if (current !== serial) return;
        clear(); primary.cancel(); failed = true; retryAt = Date.now() + 30_000; failedVoice = settings.voice;
        const available = fallback?.voices().some(v => v.local && /^en\b/i.test(v.language));
        if (!fallback || !available) {status("Radio voice unavailable. Select a local voice or retry."); finish(error); return;}
        status("Using a local browser voice");
        try {fallback.speak(text, {...settings, voice: "", allowOnline: false}, () => finish(end), () => finish(error));}
        catch {finish(error);}
      };
      if (failed && (Date.now() >= retryAt || settings.voice !== failedVoice)) failed = false;
      if (failed) {
        // Keep the existing recovery deadline; fallback calls must not postpone it.
        const deadline = retryAt; recover(); retryAt = deadline; return;
      }
      timer = setTimeout(recover, preparationMs);
      try {primary.speak(text, settings, () => finish(end), recover);} catch {recover();}
    },
    cancel() {serial++; clear(); primary.cancel(); fallback?.cancel();},
    dispose() {serial++; clear(); unsubscribe?.(); primary.dispose?.(); fallback?.dispose?.();},
  };
}
