"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

const MAX_SECONDS = 60;

export interface VoiceCaptureResult {
  title: string;
  description: string;
  category: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTranscribed: (result: VoiceCaptureResult) => void;
}

export function VoiceCaptureDialog({ open, onOpenChange, onTranscribed }: Props) {
  const t = useT();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cleanup() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }

  useEffect(() => {
    if (!open) {
      cleanup();
      setIsRecording(false);
      setIsTranscribing(false);
      setSeconds(0);
      setErrorMsg(null);
    }
    return () => { cleanup(); };
  }, [open]);

  async function startRecording() {
    setErrorMsg(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErrorMsg(t("wishlist.mic_unsupported"));
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMsg(t("wishlist.mic_denied"));
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : "";

    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      chunksRef.current = [];
      setIsRecording(false);

      if (blob.size < 2 * 1024) {
        setErrorMsg(t("wishlist.recording_too_short"));
        setSeconds(0);
        return;
      }

      await transcribe(blob);
    };

    recorder.start();
    setIsRecording(true);
    setSeconds(0);

    tickRef.current = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);

    autoStopRef.current = setTimeout(() => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    }, MAX_SECONDS * 1000);
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  async function transcribe(blob: Blob) {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      formData.append("audio", blob, `idea.${ext}`);

      const res = await fetch("/api/ai-tools/transcribe-idea", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || t("wishlist.transcribe_failed"));
        setIsTranscribing(false);
        return;
      }

      onTranscribed({
        title: data.title || "",
        description: data.description || "",
        category: data.category || "",
      });
      toast.success(t("wishlist.transcribed_success"));
      onOpenChange(false);
    } catch {
      setErrorMsg(t("wishlist.transcribe_failed"));
    } finally {
      setIsTranscribing(false);
    }
  }

  const remaining = MAX_SECONDS - seconds;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isRecording && !isTranscribing) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic size={18} className="text-primary" /> {t("wishlist.speak_idea")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            {t("wishlist.speak_hint")}
          </p>

          <div className="flex justify-center">
            {isTranscribing ? (
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 size={32} className="text-primary animate-spin" />
              </div>
            ) : (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                aria-label={isRecording ? "Stop recording" : "Start recording"}
                className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-md ${
                  isRecording
                    ? "bg-red-500 text-white animate-pulse shadow-red-200"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {isRecording ? <Square size={28} fill="currentColor" /> : <Mic size={32} />}
              </button>
            )}
          </div>

          <p className="text-center text-sm font-medium">
            {isTranscribing
              ? t("wishlist.transcribing")
              : isRecording
              ? `${t("wishlist.recording")} ${seconds}s • ${remaining}s ${t("wishlist.left")}`
              : t("wishlist.tap_to_record")}
          </p>

          {isRecording && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${(seconds / MAX_SECONDS) * 100}%` }}
              />
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-2">
              <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 leading-relaxed">{errorMsg}</p>
            </div>
          )}

          {!isRecording && !isTranscribing && (
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-xs">
                {t("common.cancel")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
