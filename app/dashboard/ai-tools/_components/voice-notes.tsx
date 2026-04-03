"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Copy, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Lang = "en-IN" | "ta-IN";

export function VoiceNotes() {
  const [isRecording, setIsRecording] = useState(false);
  const [lang, setLang] = useState<Lang>("en-IN");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [copied, setCopied] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const loggedRef = useRef(false);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
    }
  }, []);

  function startRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in your browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript + " ";
        } else {
          interimText += result[0].transcript;
        }
      }
      if (finalText) {
        setTranscript((prev) => prev + finalText);
        setInterim("");
      } else {
        setInterim(interimText);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "aborted") {
        toast.error(`Speech recognition error: ${event.error}`);
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterim("");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);

    // Log contribution once per session
    if (!loggedRef.current) {
      loggedRef.current = true;
      fetch("/api/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "used_ai_voice_notes" }),
      }).catch(() => {});
    }
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }

  function handleCopy() {
    if (!transcript.trim()) return;
    navigator.clipboard.writeText(transcript.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!supported) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <MicOff size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Speech Recognition Not Supported</p>
          <p className="text-sm text-muted-foreground mt-1">Please use Google Chrome or Microsoft Edge for voice notes.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-center gap-3">
        <Button
          variant={lang === "en-IN" ? "default" : "outline"}
          size="sm"
          onClick={() => { if (!isRecording) setLang("en-IN"); }}
          disabled={isRecording}
        >
          English
        </Button>
        <Button
          variant={lang === "ta-IN" ? "default" : "outline"}
          size="sm"
          onClick={() => { if (!isRecording) setLang("ta-IN"); }}
          disabled={isRecording}
        >
          Tamil (தமிழ்)
        </Button>
      </div>

      <div className="flex justify-center">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
            isRecording
              ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-200"
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
          }`}
        >
          {isRecording ? <MicOff size={28} /> : <Mic size={28} />}
        </button>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {isRecording ? "Listening... Tap to stop" : "Tap to start recording"}
      </p>

      {interim && (
        <p className="text-sm text-muted-foreground italic text-center animate-pulse">
          {interim}
        </p>
      )}

      {transcript && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Transcribed Text</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={handleCopy} className="text-xs h-7">
                {copied ? <><Check size={14} className="mr-1" /> Copied</> : <><Copy size={14} className="mr-1" /> Copy</>}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setTranscript(""); loggedRef.current = false; }} className="text-xs h-7 text-destructive">
                <Trash2 size={14} className="mr-1" /> Clear
              </Button>
            </div>
          </div>
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={6}
            placeholder="Transcribed text will appear here..."
          />
        </div>
      )}
    </div>
  );
}
