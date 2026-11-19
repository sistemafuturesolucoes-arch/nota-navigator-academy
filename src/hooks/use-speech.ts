import { useCallback, useEffect, useSyncExternalStore } from "react";

/** Shared narration: cache-first ElevenLabs audio with browser speech fallback. */
let speakingId: string | null = null;
let activeAudio: HTMLAudioElement | null = null;
let playbackToken = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const noopSubscribe = () => () => {};

const SUPABASE_URL = "https://itbppoailqkuxajesgys.supabase.co";
const SUPABASE_KEY = "sb_publishable_J3-cgRigKn2QardNRaOFRQ_Jja51yof";
const AUDIO_FUNCTION = `${SUPABASE_URL}/functions/v1/lesson-audio`;

export function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "pt-BR" && /google|natural|luciana|francisca/i.test(v.name)) ??
    voices.find((v) => v.lang === "pt-BR") ??
    voices.find((v) => v.lang.startsWith("pt"))
  );
}

function stopPlayback() {
  playbackToken += 1;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.removeAttribute("src");
    activeAudio.load();
    activeAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  speakingId = null;
  emit();
}

function browserFallback(text: string, id: string, token: number, onEnd?: () => void) {
  if (!("speechSynthesis" in window) || token !== playbackToken) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "pt-BR";
  utter.rate = 1.02;
  const voice = pickVoice();
  if (voice) utter.voice = voice;
  utter.onend = () => {
    if (speakingId === id && token === playbackToken) {
      speakingId = null;
      emit();
      onEnd?.();
    }
  };
  utter.onerror = () => {
    if (speakingId === id && token === playbackToken) {
      speakingId = null;
      emit();
    }
  };
  window.speechSynthesis.speak(utter);
}

export function useSpeech() {
  const current = useSyncExternalStore(subscribe, () => speakingId, () => null);
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => typeof window !== "undefined" && ("speechSynthesis" in window || "Audio" in window),
    () => false,
  );

  useEffect(() => {
    if (supported && "speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, [supported]);

  const stop = useCallback(() => {
    if (typeof window === "undefined") return;
    stopPlayback();
  }, []);

  const speak = useCallback(
    (rawText: string, id: string, onEnd?: () => void) => {
      if (typeof window === "undefined" || !supported) return;
      const text = stripMarkdown(rawText);
      if (!text) return;
      stopPlayback();
      const token = playbackToken;
      speakingId = id;
      emit();

      void (async () => {
        try {
          const response = await fetch(AUDIO_FUNCTION, {
            method: "POST",
            headers: {
              apikey: SUPABASE_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text }),
          });
          if (!response.ok) throw new Error(`Audio API HTTP ${response.status}`);
          const data = await response.json() as { audio_url?: string };
          if (!data.audio_url) throw new Error("Audio URL ausente.");
          if (token !== playbackToken || speakingId !== id) return;

          const audio = new Audio(data.audio_url);
          activeAudio = audio;
          audio.onended = () => {
            if (speakingId === id && token === playbackToken) {
              activeAudio = null;
              speakingId = null;
              emit();
              onEnd?.();
            }
          };
          audio.onerror = () => {
            if (speakingId !== id || token !== playbackToken) return;
            activeAudio = null;
            browserFallback(text, id, token, onEnd);
          };
          await audio.play();
        } catch (error) {
          console.warn("ElevenLabs indisponível; usando voz do navegador.", error);
          if (token === playbackToken && speakingId === id) {
            browserFallback(text, id, token, onEnd);
          }
        }
      })();
    },
    [supported],
  );

  return { speak, stop, speakingId: current, supported };
}
