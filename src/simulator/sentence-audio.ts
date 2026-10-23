import type {RadioVoice} from "./radio-audio";

export const SENTENCE_VOICES = [
  {id: "sentence:af_heart", name: "Heart · American female", language: "en-US", local: true},
  {id: "sentence:bf_emma", name: "Emma · British female", language: "en-GB", local: true},
  {id: "sentence:bm_george", name: "George · British male", language: "en-GB", local: true},
] satisfies RadioVoice[];
export type SentenceVoice = "af_heart" | "bf_emma" | "bm_george";
export const DEFAULT_SENTENCE_VOICE: SentenceVoice = "af_heart";
export const MAX_SPEECH_TEXT = 6000;
export const MAX_SPEECH_BYTES = 16 * 1024 * 1024;
export const sentenceVoice = (id: string): SentenceVoice =>
  (SENTENCE_VOICES.find(voice => voice.id === id)?.id.slice(9) as SentenceVoice | undefined) ?? DEFAULT_SENTENCE_VOICE;
