import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Upload,
  FileText,
  Mic,
  Square,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { analyzeBlurt, type AnalyzeResult } from "@/lib/analyze.functions";
import { extractPdfText, fileToDataUrl } from "@/lib/notes-extract";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecEvent = {
  resultIndex: number;
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
    length: number;
  }>;
};

const BAR_COUNT = 32;

function Waveform({
  active,
  levels,
}: {
  active: boolean;
  levels: number[];
}) {
  return (
    <div className="flex h-10 items-center gap-[3px]">
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        const v = levels[i] ?? 0;
        const height = active ? Math.max(8, Math.min(100, v * 100)) : 18;
        return (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-full bg-primary/70 transition-[height] duration-75",
              !active && "opacity-40",
            )}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}

const MAX_SECONDS = 3600;

export default function BlurtDashboard() {
  // --- API KEY STATE & LOGIC ---
  const [apiKey, setApiKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    const savedKey = localStorage.getItem("user_openrouter_key");
    if (savedKey) {
      setApiKey(savedKey);
      setKeySaved(true);
    }
  }, []);

  const handleSaveKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem("user_openrouter_key", apiKey.trim());
      setKeySaved(true);
      alert("API Key saved locally!");
    }
  };
  // -----------------------------
  const [board, setBoard] = useState("AQA");
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [inputMode, setInputMode] = useState<'voice' | 'type'>('voice');
  const [typedTranscript, setTypedTranscript] = useState('');
  const [notes, setNotes] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(MAX_SECONDS);
  const [transcript, setTranscript] = useState("");
  const [analyzed, setAnalyzed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string>("");
  const [fileImageDataUrl, setFileImageDataUrl] = useState<string | null>(null);
  const [fileProcessing, setFileProcessing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [interim, setInterim] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [levels, setLevels] = useState<number[]>(() =>
    Array(BAR_COUNT).fill(0),
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef<string>("");

  const runAnalyze = useServerFn(analyzeBlurt);

  const stopEverything = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    setLevels(Array(BAR_COUNT).fill(0));
  };

  useEffect(() => {
    return () => {
      stopEverything();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  const startRecording = async () => {
    setMicError(null);
    setTranscript("");
    setInterim("");
    finalTranscriptRef.current = "";
    setAnalyzed(false);
    setResult(null);
    setAnalyzeError(null);
    setSeconds(MAX_SECONDS);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setMicError("Microphone not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const next: number[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          const start = i * step;
          let sum = 0;
          for (let j = 0; j < step; j++) sum += data[start + j] ?? 0;
          next.push(sum / step / 255);
        }
        setLevels(next);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType || "audio/webm",
        });
        setAudioUrl(URL.createObjectURL(blob));
      };
      mr.start();

      setRecording(true);

      // Live speech-to-text via Web Speech API (best-effort; not in Firefox).
      const SR =
        (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
          .SpeechRecognition ||
        (window as unknown as {
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        }).webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-GB";
        rec.onresult = (e) => {
          let interimText = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            const t = r[0].transcript;
            if (r.isFinal) finalTranscriptRef.current += t + " ";
            else interimText += t;
          }
          setTranscript(finalTranscriptRef.current.trim());
          setInterim(interimText.trim());
        };
        rec.onerror = () => {};
        rec.onend = () => {};
        try {
          rec.start();
          recognitionRef.current = rec;
        } catch {
          /* already started */
        }
      }

      timerRef.current = window.setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            stopRecording();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (err) {
      console.error(err);
      setMicError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone permission denied."
          : "Could not start recording.",
      );
      stopEverything();
    }
  };

  const stopRecording = () => {
    setRecording(false);
    stopEverything();
    setInterim("");
  };

  const toggleRec = () => {
    if (recording) stopRecording();
    else void startRecording();
  };

  const handleFile = async (f: File) => {
    setFileError(null);
    setFileName(f.name);
    setFileText("");
    setFileImageDataUrl(null);
    setFileProcessing(true);
    try {
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        const text = await extractPdfText(f);
        if (!text) {
          setFileError(
            "Couldn't read text from that PDF — it may be scanned. Try pasting the notes instead.",
          );
        } else {
          setFileText(text);
        }
      } else if (f.type.startsWith("image/")) {
        const url = await fileToDataUrl(f);
        setFileImageDataUrl(url);
      } else {
        setFileError("Unsupported file type. Please upload a PDF or image.");
      }
    } catch (err) {
      console.error(err);
      setFileError("Failed to read the file.");
    } finally {
      setFileProcessing(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

 const onAnalyze = async () => {
    setAnalyzeError(null);
    const notesText = mode === "paste" ? notes : fileText;
    if (!notesText && !fileImageDataUrl) {
      setAnalyzeError(
        "Add revision notes first (upload a PDF/image or paste text).",
      );
      return;
    }
    
    // Choose active input depending on mode
    const finalTranscript = inputMode === "voice" ? transcript : typedTranscript;

    if (!finalTranscript.trim()) {
      setAnalyzeError(
        inputMode === "voice"
          ? "Record a blurt first — no transcript to analyze."
          : "Type out your blurt first before analyzing."
      );
      return;
    }
    setAnalyzing(true);
    setAnalyzed(true);
    try {
      const r = await runAnalyze({
        data: {
          apiKey: localStorage.getItem("user_openrouter_key") || "",
          notes: notesText,
          imageDataUrl: fileImageDataUrl,
          transcript: finalTranscript,
          board,
        },
      });
      setResult(r);
    } catch (err) {
      console.error(err);
      setAnalyzeError(
        err instanceof Error ? err.message : "Analysis failed.",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[300px] w-[400px] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      {/* NAVBAR */}
    
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:flex sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/40">
              <Activity className="h-5 w-5 text-primary drop-shadow-[0_0_8px_oklch(0.62_0.22_295)]" />
            </div>
            <span className="truncate text-lg font-bold tracking-tight">
              Blurt<span className="text-primary">AI</span>
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Select value={board} onValueChange={setBoard}>
              <SelectTrigger className="h-9 w-[110px] rounded-full border-border/70 bg-card/70 text-sm sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["AQA", "Edexcel", "OCR", "WJEC", "General"].map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge
              variant="outline"
              className="hidden gap-1.5 rounded-full border-primary/40 bg-primary/10 px-3 py-1 text-primary sm:inline-flex"
            >
              <Zap className="h-3 w-3" />
              Free · Unlimited Blurts
            </Badge>
          </div>
        </div>
      </header>
{/* --- API KEY BANNER --- */}
    <Card className="p-4 mb-6 bg-muted/50 border-primary/20">
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 w-full">
          <label className="text-xs font-semibold text-muted-foreground block mb-1">
            OpenRouter API Key
          </label>
          <input
            type="password"
            placeholder="sk-or-v1-..."
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setKeySaved(false);
            }}
            className="w-full px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <Button 
          onClick={handleSaveKey} 
          variant={keySaved ? "outline" : "default"}
          className="w-full sm:w-auto mt-auto"
        >
          {keySaved ? "Saved ✅" : "Save Key"}
        </Button>
      </div>
    </Card>
    {/* --------------------- */}
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:py-10">
        {/* Hero */}
        <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
            Blurt everything you remember.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            Active recall, marked by AI against your exam spec — built for GCSE
            & A-Level students.
          </p>
        </section>

        {/* STEP 1 */}
        <Card className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border-border/60 bg-card/60 p-5 backdrop-blur-sm duration-500 sm:p-7">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary ring-1 ring-primary/40">
              1
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold sm:text-xl">
                Upload Revision Notes
              </h2>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Drop your textbook notes, spec sheet, or PDF here so the AI
                knows what to mark you against.
              </p>
            </div>
          </div>

          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as "upload" | "paste")}
          >
            <TabsList className="mb-4 grid w-full grid-cols-2 rounded-full bg-secondary/60 p-1 sm:w-auto sm:inline-grid">
              <TabsTrigger value="upload" className="rounded-full">
                <Upload className="mr-2 h-4 w-4" /> Upload File
              </TabsTrigger>
              <TabsTrigger value="paste" className="rounded-full">
                <FileText className="mr-2 h-4 w-4" /> Paste Plain Text
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-0">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-all sm:p-12",
                  dragOver
                    ? "border-primary bg-primary/10"
                    : "border-border/70 bg-background/40 hover:border-primary/50 hover:bg-primary/5",
                )}
              >
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium sm:text-base">
                    {fileName ?? "Drag & drop your notes"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, PNG, JPG · up to 20MB
                  </p>
                </div>
                <Button
                  type="button"
                  className="rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileRef.current?.click();
                  }}
                >
                  Select PDF or Image
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
              </div>
              {fileProcessing && (
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Reading file…
                </p>
              )}
              {fileError && (
                <p className="mt-3 text-xs text-rose-400">{fileError}</p>
              )}
              {fileText && (
                <p className="mt-3 text-xs text-emerald-400">
                  Extracted {fileText.length.toLocaleString()} characters from
                  {" "}
                  {fileName}.
                </p>
              )}
              {fileImageDataUrl && !fileError && (
                <p className="mt-3 text-xs text-emerald-400">
                  Image ready — the AI will OCR it during analysis.
                </p>
              )}
            </TabsContent>

            <TabsContent value="paste" className="mt-0">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Paste your biology, history, or chemistry notes here..."
                className="min-h-[180px] resize-none rounded-2xl border-border/70 bg-background/40 text-sm"
              />
            </TabsContent>
          </Tabs>
        </Card>

        {/* STEP 2 */}
        <Card className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border-border/60 bg-card/60 p-5 backdrop-blur-sm duration-500 sm:p-7">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary ring-1 ring-primary/40">
                2
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold sm:text-xl">
                  Start Blurting
                </h2>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {inputMode === "voice" 
                    ? "Hit record and say everything you remember out loud." 
                    : "Type out everything you remember from memory."}
                </p>
              </div>
            </div>

            {/* Mode Switcher Toggle */}
            <div className="flex rounded-full bg-secondary/60 p-1">
              <button
                type="button"
                onClick={() => setInputMode("voice")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  inputMode === "voice"
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Mic className="h-3.5 w-3.5" /> Voice
              </button>
              <button
                type="button"
                onClick={() => setInputMode("type")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  inputMode === "type"
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileText className="h-3.5 w-3.5" /> Type
              </button>
            </div>
          </div>

          {inputMode === "voice" ? (
            /* Voice Recording UI */
            <div className="flex flex-col items-center gap-6 py-4">
              <button
                onClick={toggleRec}
                className={cn(
                  "group relative grid h-20 w-20 place-items-center rounded-full transition-all",
                  recording
                    ? "bg-rose-500 shadow-[0_0_0_8px_oklch(0.65_0.24_15/0.15)] hover:shadow-[0_0_0_12px_oklch(0.65_0.24_15/0.2)]"
                    : "bg-primary shadow-[0_0_0_8px_oklch(0.62_0.22_295/0.2),0_0_40px_oklch(0.62_0.22_295/0.5)] hover:shadow-[0_0_0_12px_oklch(0.62_0.22_295/0.25),0_0_60px_oklch(0.62_0.22_295/0.6)]",
                )}
                aria-label={recording ? "Stop recording" : "Start recording"}
              >
                {recording && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" />
                )}
                {recording ? (
                  <Square className="h-7 w-7 fill-white text-white" />
                ) : (
                  <Mic className="h-8 w-8 text-white" />
                )}
              </button>

              <div className="flex w-full max-w-md items-center gap-4">
                <span
                  className={cn(
                    "font-mono text-2xl tabular-nums tracking-tight",
                    recording ? "text-rose-400" : "text-muted-foreground",
                  )}
                >
                  {mm}:{ss}
                </span>
                <div className="flex-1">
                  <Waveform active={recording} levels={levels} />
                </div>
              </div>

              <div className="w-full rounded-2xl border border-border/60 bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      recording ? "animate-pulse bg-rose-500" : "bg-muted",
                    )}
                  />
                  {recording
                    ? `Recording · ${seconds}s left`
                    : audioUrl
                      ? "Recording ready"
                      : "Live Transcript"}
                </div>
                {micError ? (
                  <p className="min-h-[3rem] text-sm text-rose-400">{micError}</p>
                ) : (
                  <>
                    <p className="min-h-[3rem] text-sm leading-relaxed text-foreground/90">
                      {transcript ? (
                        <>
                          <span>{transcript}</span>
                          {interim && (
                            <span className="text-muted-foreground">
                              {" "}
                              {interim}
                            </span>
                          )}
                        </>
                      ) : interim ? (
                        <span className="text-muted-foreground">{interim}</span>
                      ) : (
                        <span className="text-muted-foreground">
                          Tap the mic to record up to 60 seconds of your blurt...
                        </span>
                      )}
                    </p>
                    {audioUrl && !recording && (
                      <audio
                        controls
                        src={audioUrl}
                        className="mt-3 w-full"
                        preload="metadata"
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Typing UI */
            <div className="py-2">
              <Textarea
                value={typedTranscript}
                onChange={(e) => setTypedTranscript(e.target.value)}
                placeholder="Type out everything you remember about this topic without looking at your notes..."
                className="min-h-[220px] resize-none rounded-2xl border-border/70 bg-background/40 p-4 text-sm leading-relaxed focus:ring-2 focus:ring-primary"
              />
            </div>
          )}
        </Card>

        {/* STEP 3 CTA + Results */}
        <div className="space-y-6">
          <Button
            onClick={onAnalyze}
            disabled={analyzing}
            className="group h-14 w-full rounded-2xl bg-gradient-to-r from-primary to-violet-500 text-base font-semibold shadow-[0_10px_40px_-10px_oklch(0.62_0.22_295/0.6)] transition-all hover:from-primary hover:to-violet-400 hover:shadow-[0_15px_50px_-10px_oklch(0.62_0.22_295/0.8)] sm:h-16 sm:text-lg"
          >
            {analyzing ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-5 w-5 transition-transform group-hover:rotate-12" />
            )}
            {analyzing ? "Analyzing…" : "Analyze My Blurt with AI"}
          </Button>

          {analyzeError && (
            <p className="text-center text-sm text-rose-400">{analyzeError}</p>
          )}

          {result && (
            <Card className="animate-in fade-in rounded-2xl border-primary/40 bg-primary/10 p-5 duration-500">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-primary">
                    Overall Accuracy
                  </p>
                  <p className="mt-1 text-sm text-foreground/90">
                    {result.summary}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-5xl font-bold tabular-nums text-primary">
                    {result.accuracy}
                    <span className="text-2xl text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-background/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400 transition-all duration-700"
                  style={{ width: `${result.accuracy}%` }}
                />
              </div>
            </Card>
          )}

          <div
            className={cn(
              "grid gap-4 transition-all sm:grid-cols-3",
              analyzed ? "opacity-100" : "opacity-60",
            )}
          >
            {/* Matched */}
            <Card className="animate-in fade-in rounded-2xl border-emerald-500/30 bg-emerald-500/5 p-5 duration-500">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <h3 className="font-semibold">Covered Key Points</h3>
              </div>
              <Badge className="mb-4 rounded-full bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20">
                {result ? `${result.matched.length} hits` : "Awaiting blurt"}
              </Badge>
              <ul className="space-y-2">
                {(result?.matched ?? []).map((m) => (
                  <li
                    key={m}
                    className="flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{m}</span>
                  </li>
                ))}
                {!result && (
                  <li className="rounded-xl px-3 py-2 text-sm text-muted-foreground">
                    Points you recalled correctly will appear here.
                  </li>
                )}
              </ul>
            </Card>

            {/* Missed */}
            <Card className="animate-in fade-in rounded-2xl border-rose-500/30 bg-rose-500/5 p-5 duration-500">
              <div className="mb-3 flex items-center gap-2">
                <XCircle className="h-5 w-5 text-rose-400" />
                <h3 className="font-semibold">Critical Gaps Missed</h3>
              </div>
              <Badge className="mb-4 rounded-full bg-rose-500/15 text-rose-300 hover:bg-rose-500/20">
                {result ? `${result.missed.length} gaps` : "Awaiting blurt"}
              </Badge>
              <ul className="space-y-2">
                {(result?.missed ?? []).map((m) => (
                  <li
                    key={m}
                    className="flex items-start gap-2 rounded-xl bg-rose-500/10 px-3 py-2 text-sm"
                  >
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    <span>{m}</span>
                  </li>
                ))}
                {!result && (
                  <li className="rounded-xl px-3 py-2 text-sm text-muted-foreground">
                    Key points you missed will land here.
                  </li>
                )}
              </ul>
            </Card>

            {/* Feedback */}
            <Card className="animate-in fade-in rounded-2xl border-amber-500/30 bg-amber-500/5 p-5 duration-500">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <h3 className="font-semibold">Fact Checks & Feedback</h3>
              </div>
              <Badge className="mb-4 rounded-full bg-amber-500/15 text-amber-300 hover:bg-amber-500/20">
                Review
              </Badge>
              <ul className="space-y-2">
                {(result?.feedback ?? []).map((f) => (
                  <li
                    key={f.title}
                    className="rounded-xl bg-amber-500/10 p-3 text-sm"
                  >
                    <p className="font-medium text-amber-200">{f.title}</p>
                    <p className="mt-1 text-muted-foreground">{f.body}</p>
                  </li>
                ))}
                {!result && (
                  <li className="rounded-xl px-3 py-2 text-sm text-muted-foreground">
                    Fact checks and phrasing tips will appear here.
                  </li>
                )}
              </ul>
            </Card>
          </div>
        </div>

        <footer className="pb-6 pt-4 text-center text-xs text-muted-foreground">
          BlurtAI · Active recall, marked by AI · Made for UK students
        </footer>
      </main>
    </div>
  );
}