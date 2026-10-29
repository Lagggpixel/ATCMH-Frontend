import {type Exercise, type Frequency, type Message} from "./model";
import {aviationSpeech} from "./radio-speech";
export {aviationSpeech} from "./radio-speech";

export interface RadioVoice {id: string; name: string; language: string; local: boolean}
export interface VoiceSettings {voice: string; rate: number; volume: number; allowOnline?: boolean; radioFilter?: boolean}
export interface SpeechOutput {
  voices(): RadioVoice[];
  onVoicesChanged(listener: () => void): () => void;
  speak(text: string, settings: VoiceSettings, end: () => void, error: (reason?: unknown) => void): void;
  prepare?(text: string, settings: VoiceSettings): void;
  prepareDraft?(text: string, settings: VoiceSettings): void;
  cancelDraft?(): void;
  cancel(): void;
  activate?(): void;
  warm?(): void;
  dispose?(): void;
  onStatusChanged?(listener: (status: string) => void): () => void;
}
interface AudioState extends VoiceSettings {
  available: boolean; enabled: boolean; voices: RadioVoice[]; speaking: string; error: string; status: string;
}
export const DEFAULT_RADIO_RATE = 1;
const INITIAL_STATE: AudioState = {allowOnline: false, available: false, enabled: true, voices: [], voice: "", rate: DEFAULT_RADIO_RATE, volume: 1, speaking: "", error: "", status: ""};
export interface AudioPreference {
  read(): boolean | undefined; write(enabled: boolean): void;
  readVoiceSettings?(): Pick<VoiceSettings, "voice" | "rate"> | undefined;
  writeVoiceSettings?(settings: Pick<VoiceSettings, "voice" | "rate">): void;
}
/** Online voice consent and volume remain per tab. */
export function browserAudioPreference(accountId: string, role: "staff" | "mentee"): AudioPreference {
  const key = `simulator:radio-audio:v1:${accountId}:${role}`;
  // A new key applies the George/1× defaults once without altering saved mute state.
  const voiceKey = `simulator:radio-voice:v2:${accountId}:${role}`;
  return {
    read: () => {try {const value = window.localStorage.getItem(key); return value === "true" ? true : value === "false" ? false : undefined;} catch {return undefined;}},
    write: enabled => {try {window.localStorage.setItem(key, String(enabled));} catch { /* Audio still works when browser storage is unavailable. */ }},
    readVoiceSettings: () => {try {
      const value = JSON.parse(window.localStorage.getItem(voiceKey) ?? "null");
      if (value && typeof value.voice === "string" && value.voice.length <= 256 && typeof value.rate === "number" && Number.isFinite(value.rate) && value.rate >= .7 && value.rate <= 2) return {voice: value.voice, rate: value.rate};
    } catch { /* Use defaults for unavailable or invalid storage. */ } return undefined;},
    writeVoiceSettings: settings => {try {window.localStorage.setItem(voiceKey, JSON.stringify(settings));} catch { /* Keep settings for this tab. */ }},
  };
}

/** Radar controls stop bubbling events; unlock before those handlers consume a gesture. */
export function browserAudioActivation(activate: () => void) {
  const gestures = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;
  const resume = () => {if (document.visibilityState === "visible") activate();};
  for (const event of gestures) window.addEventListener(event, activate, {capture: true, passive: true});
  document.addEventListener("visibilitychange", resume); window.addEventListener("pageshow", resume);
  return () => {
    for (const event of gestures) window.removeEventListener(event, activate, true);
    document.removeEventListener("visibilitychange", resume); window.removeEventListener("pageshow", resume);
  };
}
export const radioMessageText = (message: Message, callsigns: readonly string[] = []) => aviationSpeech(message.text, callsigns);

/** One player per tab. Snapshot recovery establishes a new baseline,
 * so old messages and repeated transport snapshots never become radio transmissions. */
export class RadioAudio {
  private state = INITIAL_STATE;
  private listeners = new Set<() => void>();
  private output: SpeechOutput | null = null;
  private preference?: AudioPreference;
  private seen = new Set<string>();
  private previous: {id: string; connected: boolean; elapsed: number; atis: string; channel?: string} | null = null;
  private queue: string[] = [];
  private failedText = "";
  private failureCount = 0;
  private callsigns: string[] = [];
  private generation = 0;
  private paused = false;
  private waitingForRetry = false;
  private draftGeneration = 0;
  private draftTimer?: ReturnType<typeof setTimeout>;
  /** Warm only the reviewed draft; this never sends an ATC command or starts playback. */
  prepareDraft = (text: string) => {
    this.cancelDraft();
    const generation = this.draftGeneration;
    if (text.trim() && this.state.enabled && !this.paused) this.draftTimer = setTimeout(() => {
      if (generation === this.draftGeneration && this.state.enabled && !this.paused)
        this.output?.prepareDraft?.(aviationSpeech(text, this.callsigns), this.state);
    }, 500);
    return () => {if (generation === this.draftGeneration) this.cancelDraft();};
  };
  private cancelDraft() {this.draftGeneration++; clearTimeout(this.draftTimer); this.draftTimer = undefined; this.output?.cancelDraft?.();}
  subscribe = (listener: () => void) => {this.listeners.add(listener); return () => {this.listeners.delete(listener);};};
  getSnapshot = () => this.state;
  getServerSnapshot = () => INITIAL_STATE;
  private update(patch: Partial<AudioState>) {this.state = {...this.state, ...patch}; this.listeners.forEach(listener => listener());}
  start(output: SpeechOutput | null, preference?: AudioPreference) {
    this.output = output;
    this.preference = preference;
    const voiceSettings = preference?.readVoiceSettings?.() ?? {voice: "", rate: DEFAULT_RADIO_RATE};
    preference?.writeVoiceSettings?.(voiceSettings);
    this.update({...voiceSettings, available: Boolean(output), enabled: Boolean(output) && (preference?.read() ?? true)});
    if (this.state.enabled) output?.warm?.();
    const refresh = () => {this.update({voices: output?.voices() ?? []}); this.next();};
    const unsubscribe = output?.onVoicesChanged(refresh);
    const unsubscribeStatus = output?.onStatusChanged?.(status => this.update({status}));
    refresh();
    return () => {unsubscribe?.(); unsubscribeStatus?.(); this.stop(); output?.dispose?.(); this.output = null; this.previous = null; this.seen.clear();};
  }
  observe(exercise: Exercise, connected: boolean, scope: Frequency | "all", paused = false, channel?: string) {
    this.callsigns = exercise.aircraft.map(a => a.callsign);
    const previous = this.previous;
    const baseline = !previous || previous.channel !== channel || previous.id !== exercise.id || exercise.elapsed < previous.elapsed || (!exercise.messages.length && this.seen.size > 0);
    if (baseline) this.stop();
    else if (!connected && previous.connected) {
      const interrupted = this.state.speaking;
      this.generation++; this.output?.cancel(); this.update({speaking: ""});
      if (interrupted) this.queue.unshift(interrupted);
    }
    if (paused && !this.paused && this.state.speaking) {
      const interrupted = this.state.speaking;
      this.generation++; this.output?.cancel(); this.update({speaking: ""});
      this.queue.unshift(interrupted);
    }
    if (paused) this.cancelDraft();
    this.paused = paused;
    const fresh = baseline || !connected ? [] : exercise.messages.filter(m => !this.seen.has(m.id) && (!exercise.positions?.length || scope === "all" || m.frequency === scope));
    if (baseline || connected) this.seen = new Set(exercise.messages.map(m => m.id));
    this.previous = {id: exercise.id, connected, elapsed: exercise.elapsed, atis: exercise.publishedAtis, channel};
    if (this.state.enabled && connected) {
      // The published broadcast is already known when a session opens. Prepare it
      // silently so Read published ATIS does not need a cold synthesis request.
      if (baseline && !paused && exercise.publishedAtis !== "ATIS UNAVAILABLE") this.output?.prepare?.(aviationSpeech(exercise.publishedAtis), this.state);
      for (const message of fresh) this.queue.push(radioMessageText(message, this.callsigns));
      if (!baseline && previous.atis !== exercise.publishedAtis && exercise.publishedAtis !== "ATIS UNAVAILABLE") this.queue.push(aviationSpeech(exercise.publishedAtis));
      this.next();
    }
  }
  setEnabled(enabled: boolean) {
    this.stop();
    if (enabled) this.output?.activate?.();
    this.preference?.write(enabled);
    this.update({enabled: enabled && this.state.available, error: ""});
    // Speak directly from the click gesture to unlock browser audio playback.
    if (this.state.enabled) this.say("Radio audio enabled.");
  }
  /** Retry blocked autoplay from the next simulator interaction, without changing
   * the user's saved audio choice or requiring an off/on toggle. */
  activate = () => {
    if (!this.state.enabled) return;
    this.output?.activate?.();
    this.waitingForRetry = false;
    this.next();
  };
  setSettings(settings: Partial<VoiceSettings>) {
    if (settings.voice !== undefined || settings.allowOnline !== undefined) this.stop();
    this.update({allowOnline: settings.allowOnline ?? this.state.allowOnline, voice: settings.allowOnline === false ? "" : settings.voice ?? this.state.voice, rate: Math.min(2, Math.max(0.7, settings.rate ?? this.state.rate)), volume: Math.min(1, Math.max(0, settings.volume ?? this.state.volume))});
    if (settings.voice !== undefined || settings.rate !== undefined || settings.allowOnline === false) this.preference?.writeVoiceSettings?.({voice: this.state.voices.some(voice => voice.id === this.state.voice && voice.local) ? this.state.voice : "", rate: this.state.rate});
    if (settings.radioFilter !== undefined) this.update({radioFilter: settings.radioFilter});
  }
  say(text: string) {
    if (!this.state.enabled || !this.output) return;
    this.queue.push(aviationSpeech(text, this.callsigns)); this.next();
  }
  stop() {
    this.cancelDraft();
    this.generation++; this.queue = []; this.waitingForRetry = false;
    if (this.state.speaking) this.output?.cancel();
    if (this.state.speaking) this.update({speaking: ""});
  }
  private next() {
    if (!this.output || !this.state.enabled || this.previous?.connected === false || this.paused || this.waitingForRetry || !this.queue.length) return;
    // Load one transmission ahead while the current one plays, without reordering radio calls.
    if (this.state.speaking) {this.output.prepare?.(this.queue[0], this.state); return;}
    // Device voices often arrive asynchronously, after the first radio frame.
    if (!this.state.voices.length) return;
    const text = this.queue.shift()!;
    const generation = this.generation;
    this.update({speaking: text, error: ""});
    const error = (reason?: unknown) => {
      if (generation !== this.generation) return;
      this.generation++; this.output?.cancel();
      const blocked = reason instanceof Error && reason.name === "NotAllowedError";
      if (!blocked) {this.failureCount = this.failedText === text ? this.failureCount + 1 : 1; this.failedText = text;}
      if (!blocked && this.failureCount >= 2) {
        this.update({speaking: "", error: "A radio message could not play. Its text remains in the message log.", status: "Playback failed; continuing with the next message"});
        this.waitingForRetry = false; queueMicrotask(() => this.next()); return;
      }
      this.queue.unshift(text); this.waitingForRetry = true;
      this.update({speaking: "", error: "Voice playback is waiting. Click or press a key in Sweatbox to retry. If needed, select an available voice in Voice settings."});
    };
    const {voice, rate, volume, allowOnline, radioFilter} = this.state;
    try {this.output.speak(text, {voice, rate, volume, allowOnline, ...(radioFilter === undefined ? {} : {radioFilter})}, () => {
      if (generation !== this.generation) return;
      this.failedText = ""; this.failureCount = 0; this.update({speaking: ""}); this.next();
    }, error);
      if (this.queue.length) this.output.prepare?.(this.queue[0], this.state);
    } catch {error();}
  }
}

/** Browser-native speech: no application speech endpoint, key or audio recording. */
export function browserSpeechOutput(): SpeechOutput | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return null;
  const synth = window.speechSynthesis;
  let utterance: SpeechSynthesisUtterance | null = null;
  return {
    voices: () => synth.getVoices().map(v => ({id: v.voiceURI, name: v.name, language: v.lang, local: v.localService})),
    onVoicesChanged: listener => {synth.addEventListener("voiceschanged", listener); return () => synth.removeEventListener("voiceschanged", listener);},
    speak: (text, settings, end, error) => {
      const voices = synth.getVoices();
      const voice = selectSpeechVoice(voices, settings);
      if (!voice) {error(); return;}
      utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voice?.lang ?? "en-GB"; utterance.voice = voice ?? null;
      utterance.rate = settings.rate; utterance.volume = settings.volume;
      utterance.onend = () => {utterance = null; end();};
      utterance.onerror = () => {utterance = null; error();};
      if (synth.paused) synth.resume();
      synth.speak(utterance);
    },
    cancel: () => {
      if (utterance) {utterance.onend = null; utterance.onerror = null; utterance = null;}
      synth.cancel();
    },
  };
}

/** Automatic selection never falls through to a browser/provider default voice. */
export function selectSpeechVoice<T extends {voiceURI: string; localService: boolean; lang: string}>(voices: T[], settings: VoiceSettings): T | undefined {
  const explicit = voices.find(v => v.voiceURI === settings.voice);
  if (settings.voice && !settings.voice.startsWith("pocket:")) return explicit && (explicit.localService || settings.allowOnline === true) ? explicit : undefined;
  return voices.find(v => v.localService && /^en[-_]GB$/i.test(v.lang)) ?? voices.find(v => v.localService && /^en\b/i.test(v.lang));
}
