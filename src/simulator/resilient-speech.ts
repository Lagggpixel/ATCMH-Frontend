import type {SpeechOutput, VoiceSettings} from "./radio-audio";

/** Bound time to actual playback. Recovery stays on this site or device. */
export function resilientSpeechOutput(primary: SpeechOutput | null, fallback: SpeechOutput | null, preparationMs = 2500): SpeechOutput | null {
  if (!primary) return fallback;
  let failed = false, retryAt = 0, failedVoice = "", serial = 0, timer: ReturnType<typeof setTimeout> | undefined;
  let recovering = false;
  let status: (text: string) => void = () => {};
  const clear = () => {clearTimeout(timer); timer = undefined;};
  const unsubscribe = primary.onStatusChanged?.(text => {
    if (recovering) return;
    if (text && !/prepar|load|download/i.test(text)) clear();
    status(text);
  });
  const unsubscribeFallback = fallback?.onStatusChanged?.(text => {if (recovering) status(text);});
  const backupSettings = (settings: VoiceSettings): VoiceSettings => {
    const name = settings.voice.split(":").at(-1) || "af_heart";
    const voice = fallback?.voices().find(voice => voice.local && voice.id.split(":").at(-1) === name);
    return {...settings, voice: voice?.id ?? "", allowOnline: false};
  };
  return {
    voices: () => primary.voices(),
    onVoicesChanged: listener => primary.onVoicesChanged(listener),
    onStatusChanged: listener => {status = listener; return () => {status = () => {};};},
    activate: () => {primary.activate?.(); fallback?.activate?.();},
    warm: () => primary.warm?.(),
    prepare: (text, settings) => {
      if (!failed) primary.prepare?.(text, settings);
      // Warm the backup during the preceding call, rather than after a timeout.
      fallback?.prepare?.(text, backupSettings(settings));
    },
    prepareDraft: (text, settings) => {if (!failed) primary.prepareDraft?.(text, settings);},
    cancelDraft: () => primary.cancelDraft?.(),
    speak(text, settings, end, error) {
      clear(); recovering = false; const current = ++serial;
      const finish = (callback: () => void) => {if (current === serial) {clear(); serial++; callback();}};
      const recover = () => {
        if (current !== serial || recovering) return;
        recovering = true;
        clear(); primary.cancel();
        const available = fallback?.voices().some(v => v.local && /^en\b/i.test(v.language));
        if (!fallback || !available) {status("Radio voice unavailable. Select a local voice or retry."); finish(error); return;}
        failed = true; retryAt = Date.now() + 30_000; failedVoice = settings.voice;
        status("Preparing backup radio voice…");
        try {fallback.speak(text, backupSettings(settings), () => finish(end), reason => finish(() => error(reason)));}
        catch {finish(error);}
      };
      if (failed && (Date.now() >= retryAt || settings.voice !== failedVoice)) failed = false;
      if (failed) {
        // Keep the existing recovery deadline; fallback calls must not postpone it.
        const deadline = retryAt; recover(); retryAt = deadline; return;
      }
      timer = setTimeout(recover, preparationMs);
      const failure = (reason?: unknown) => {
        if (current !== serial || recovering) return;
        // Autoplay denial is repaired by a gesture, not a generator cooldown or
        // a second media element subject to the same browser restriction.
        if (reason instanceof Error && reason.name === "NotAllowedError") {
          clear(); primary.cancel(); finish(() => error(reason));
        } else recover();
      };
      try {primary.speak(text, settings, () => {if (!recovering) finish(end);}, failure);} catch (reason) {failure(reason);}
    },
    cancel() {serial++; clear(); primary.cancel(); fallback?.cancel();},
    dispose() {serial++; clear(); unsubscribe?.(); unsubscribeFallback?.(); primary.dispose?.(); fallback?.dispose?.();},
  };
}
