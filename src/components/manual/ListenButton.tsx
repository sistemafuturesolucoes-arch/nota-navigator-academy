import { Square, Volume2 } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { useSpeech } from "@/hooks/use-speech";

export function ListenButton({
  text,
  id,
  label = "Ouvir",
  ...props
}: { text: string; id: string; label?: string } & Omit<ButtonProps, "onClick" | "id">) {
  const { speak, stop, speakingId, supported } = useSpeech();
  if (!supported) return null;
  const playing = speakingId === id;
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      aria-pressed={playing}
      onClick={() => (playing ? stop() : speak(text, id))}
      {...props}
    >
      {playing ? <Square /> : <Volume2 />}
      {playing ? "Parar" : label}
    </Button>
  );
}
