import {type Exercise, type Frequency, type Message} from "./model";

export interface RadioVoice {id: string; name: string; language: string; local: boolean}
export interface VoiceSettings {voice: string; rate: number; volume: number; allowOnline?: boolean}
export interface SpeechOutput {
  voices(): RadioVoice[];
  onVoicesChanged(listener: () => void): () => void;
  speak(text: string, settings: VoiceSettings, end: () => void, error: () => void): void;
  cancel(): void;
}
interface AudioState extends VoiceSettings {
  available: boolean; enabled: boolean; voices: RadioVoice[]; speaking: string; error: string;
}
const INITIAL_STATE: AudioState = {allowOnline: false, available: false, enabled: true, voices: [], voice: "", rate: 1, volume: 1, speaking: "", error: ""};
export interface AudioPreference {read(): boolean | undefined; write(enabled: boolean): void}
/** Only the on/off choice persists; online voice consent remains per tab. */
export function browserAudioPreference(accountId: string, role: "staff" | "mentee"): AudioPreference {
  const key = `atcmh:simulator:radio-audio:v1:${accountId}:${role}`;
  return {
    read: () => {try {const value = window.localStorage.getItem(key); return value === "true" ? true : value === "false" ? false : undefined;} catch {return undefined;}},
    write: enabled => {try {window.localStorage.setItem(key, String(enabled));} catch { /* Audio still works when browser storage is unavailable. */ }},
  };
}
const DIGITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const digits = (value: string) => [...value].map(n => DIGITS[Number(n)]).join(" ");
export function aviationSpeech(text: string): string {
  return text.replace(/(\bon (?:left |right )?(?:final|base|downwind|crosswind|upwind) )(\d{2})([LRC])?\b/gi, (_, leg: string, number: string, side: string | undefined) => `${leg}${digits(number)}${side ? ` ${{L: "left", R: "right", C: "center"}[side.toUpperCase()]}` : ""}`)
    .replace(/\brunway (\d{2})([LRC])?\b/gi, (_, number: string, side: string | undefined) => `Runway ${digits(number)}${side ? ` ${{L: "left", R: "right", C: "center"}[side.toUpperCase()]}` : ""}`)
    .replace(/\b(\d{3})\.(\d{2,3})\b/g, (_, whole: string, fraction: string) => `${digits(whole)} decimal ${digits(fraction)}`);
}
export const radioMessageText = (message: Message) => aviationSpeech(message.text);

/** One player per tab. Snapshot recovery establishes a new baseline,
 * so old messages and repeated transport snapshots never become radio transmissions. */
export class RadioAudio {
  private state = INITIAL_STATE;
  private listeners = new Set<() => void>();
  private output: SpeechOutput | null = null;
  private preference?: AudioPreference;
  private seen = new Set<string>();
  private previous: {id: string; connected: boolean; elapsed: number; atis: string} | null = null;
  private queue: string[] = [];
  private generation = 0;
  private paused = false;
  private waitingForRetry = false;
  subscribe = (listener: () => void) => {this.listeners.add(listener); return () => {this.listeners.delete(listener);};};
  getSnapshot = () => this.state;
  getServerSnapshot = () => INITIAL_STATE;
  private update(patch: Partial<AudioState>) {this.state = {...this.state, ...patch}; this.listeners.forEach(listener => listener());}
  start(output: SpeechOutput | null, preference?: AudioPreference) {
    this.output = output;
    this.preference = preference;
    this.update({available: Boolean(output), enabled: Boolean(output) && (preference?.read() ?? true)});
    const refresh = () => {this.update({voices: output?.voices() ?? []}); this.next();};
    const unsubscribe = output?.onVoicesChanged(refresh);
    refresh();
    return () => {unsubscribe?.(); this.stop(); this.output = null; this.previous = null; this.seen.clear();};
  }
  observe(exercise: Exercise, connected: boolean, _scope: Frequency | "all", paused = false) {
    const previous = this.previous;
    const baseline = !previous || !previous.connected || !connected || previous.id !== exercise.id || exercise.elapsed < previous.elapsed || (!exercise.messages.length && this.seen.size > 0);
    if (baseline) this.stop();
    if (paused && !this.paused && this.state.speaking) {
      const interrupted = this.state.speaking;
      this.generation++; this.output?.cancel(); this.update({speaking: ""});
      this.queue.unshift(interrupted);
    }
    this.paused = paused;
    const fresh = baseline ? [] : exercise.messages.filter(m => !this.seen.has(m.id));
    this.seen = new Set(exercise.messages.map(m => m.id));
    this.previous = {id: exercise.id, connected, elapsed: exercise.elapsed, atis: exercise.publishedAtis};
    if (this.state.enabled && connected) {
      for (const message of fresh) this.queue.push(radioMessageText(message));
      if (!baseline && previous.atis !== exercise.publishedAtis && exercise.publishedAtis !== "ATIS UNAVAILABLE") this.queue.push(aviationSpeech(exercise.publishedAtis));
      this.next();
    }
  }
  setEnabled(enabled: boolean) {
    this.stop();
    this.preference?.write(enabled);
    this.update({enabled: enabled && this.state.available, error: ""});
    // Speak directly from the click gesture to unlock browser audio playback.
    if (this.state.enabled) this.say("Radio audio enabled.");
  }
  /** Retry blocked autoplay from the next simulator interaction, without changing
   * the user's saved audio choice or requiring an off/on toggle. */
  activate = () => {
    if (!this.state.enabled) return;
    this.waitingForRetry = false;
    this.next();
  };
  setSettings(settings: Partial<VoiceSettings>) {
    if (settings.voice !== undefined || settings.allowOnline !== undefined) this.stop();
    this.update({allowOnline: settings.allowOnline ?? this.state.allowOnline, voice: settings.allowOnline === false ? "" : settings.voice ?? this.state.voice, rate: Math.min(1.5, Math.max(0.7, settings.rate ?? this.state.rate)), volume: Math.min(1, Math.max(0, settings.volume ?? this.state.volume))});
  }
  say(text: string) {
    if (!this.state.enabled || !this.output) return;
    this.queue.push(aviationSpeech(text)); this.next();
  }
  stop() {
    this.generation++; this.queue = []; this.waitingForRetry = false;
    if (this.state.speaking) this.output?.cancel();
    if (this.state.speaking) this.update({speaking: ""});
  }
  private next() {
    if (!this.output || !this.state.enabled || this.paused || this.waitingForRetry || this.state.speaking || !this.queue.length) return;
    // Device voices often arrive asynchronously, after the first radio frame.
    if (!this.state.voices.length) return;
    const text = this.queue.shift()!;
    const generation = this.generation;
    this.update({speaking: text, error: ""});
    const error = () => {
      if (generation !== this.generation) return;
      this.generation++; this.output?.cancel();
      this.queue.unshift(text); this.waitingForRetry = true;
      this.update({speaking: "", error: "Voice playback is waiting. Click or press a key in the simulator to retry. If needed, select an available voice in Voice settings."});
    };
    const {voice, rate, volume, allowOnline} = this.state;
    try {this.output.speak(text, {voice, rate, volume, allowOnline}, () => {
      if (generation !== this.generation) return;
      this.update({speaking: ""}); this.next();
    }, error);} catch {error();}
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
  if (settings.voice) return explicit && (explicit.localService || settings.allowOnline === true) ? explicit : undefined;
  return voices.find(v => v.localService && /^en[-_]GB$/i.test(v.lang)) ?? voices.find(v => v.localService && /^en\b/i.test(v.lang));
}
