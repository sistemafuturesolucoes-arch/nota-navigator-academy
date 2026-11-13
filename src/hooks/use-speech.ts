import { useCallback, useEffect, useSyncExternalStore } from "react";

/** Browser narration in Portuguese. Only one text plays at a time across the app. */
let speakingId: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

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

export function useSpeech() {
  const current = useSyncExternalStore(
    subscribe,
    () => speakingId,
    () => null,
  );
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (supported) window.speechSynthesis.getVoices();
  }, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    speakingId = null;
    emit();
  }, [supported]);

  const speak = useCallback(
    (text: string, id: string, onEnd?: () => void) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(stripMarkdown(text));
      utter.lang = "pt-BR";
      utter.rate = 1.02;
      const voice = pickVoice();
      if (voice) utter.voice = voice;
      utter.onend = () => {
        if (speakingId === id) {
          speakingId = null;
          emit();
          onEnd?.();
        }
      };
      utter.onerror = () => {
        if (speakingId === id) {
          speakingId = null;
          emit();
        }
      };
      speakingId = id;
      emit();
      window.speechSynthesis.speak(utter);
    },
    [supported],
  );

  return { speak, stop, speakingId: current, supported };
}
