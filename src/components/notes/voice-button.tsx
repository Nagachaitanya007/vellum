import { Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type SpeechResult = { isFinal: boolean; 0?: { transcript: string } };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export function VoiceButton({
  onText,
  onHint,
}: {
  onText: (transcript: string) => void;
  onHint: (hint: string | null) => void;
}) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => recRef.current?.stop();
  }, []);

  function stop() {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }

  function toggle() {
    if (listening) {
      stop();
      onHint(null);
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) {
      onHint("Voice typing needs Chrome or Edge.");
      return;
    }
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const piece = result?.["0"]?.transcript ?? "";
        if (result?.isFinal) finalText += piece;
        else interim += piece;
      }
      if (finalText.trim()) onText(finalText);
      onHint(interim.trim() ? interim.trim() : "Listening…");
    };
    rec.onerror = () => {
      stop();
      onHint("Couldn’t use the microphone.");
    };
    rec.onend = () => {
      setListening(false);
      onHint(null);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
      onHint("Listening…");
    } catch {
      stop();
      onHint("Couldn’t start voice typing.");
    }
  }

  return (
    <Button
      variant="quiet"
      size="sm"
      className={
        listening
          ? "bg-paper-fg text-paper hover:bg-paper-fg hover:text-paper"
          : "text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
      }
      onClick={toggle}
      aria-pressed={listening}
    >
      <Mic /> {listening ? "Stop" : "Voice"}
    </Button>
  );
}
