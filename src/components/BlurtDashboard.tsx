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

const MATCHED = [
  "Defined Photosynthesis correctly",
  "Chloroplast location in mesophyll cells",
  "Word equation: CO₂ + H₂O → glucose + O₂",
];

const MISSED = [
  "Omitted Light-dependent stage",
  "Missed ATP definition & role",
  "No mention of NADPH as reducing agent",
];

const FEEDBACK = [
  {
    title: "Location mix-up",
    body: "You said Calvin cycle occurs in the thylakoid — it actually happens in the stroma.",
  },
  {
    title: "Terminology",
    body: "‘Sunlight energy’ is vague. Examiners want ‘light energy absorbed by chlorophyll’.",
  },
];

function Waveform({ active }: { active: boolean }) {
  const bars = Array.from({ length: 32 });
  return (
    <div className="flex h-10 items-center gap-[3px]">
      {bars.map((_, i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-full bg-primary/70 transition-all",
            active ? "animate-pulse" : "opacity-40",
          )}
          style={{
            height: active
              ? `${20 + Math.abs(Math.sin((i + 1) * 0.8)) * 70}%`
              : "18%",
            animationDelay: `${i * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}

export default function BlurtDashboard() {
  const [board, setBoard] = useState("AQA");
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [notes, setNotes] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [analyzed, setAnalyzed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      setSeconds((s) => s + 1);
      const words = [
        "Photosynthesis",
        "happens",
        "in the",
        "chloroplasts",
        "of plant",
        "cells",
        "using",
        "light energy",
        "to convert",
        "carbon dioxide",
        "and water",
        "into glucose",
        "and oxygen...",
      ];
      setTranscript((t) =>
        t.length > 260 ? t : (t ? t + " " : "") + (words[Math.min(seconds, 12)] ?? ""),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [recording, seconds]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  const toggleRec = () => {
    if (!recording) {
      setSeconds(0);
      setTranscript("");
      setAnalyzed(false);
    }
    setRecording((r) => !r);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFileName(f.name);
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
              Free · 3/3 Blurts
            </Badge>
          </div>
        </div>
      </header>

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
                  onChange={(e) =>
                    setFileName(e.target.files?.[0]?.name ?? null)
                  }
                />
              </div>
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
          <div className="mb-6 flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary ring-1 ring-primary/40">
              2
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold sm:text-xl">
                Start Blurting
              </h2>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Hit record and say everything you remember out loud for 60
                seconds.
              </p>
            </div>
          </div>

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
                <Waveform active={recording} />
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
                Live Transcript
              </div>
              <p className="min-h-[3rem] text-sm leading-relaxed text-foreground/90">
                {transcript || (
                  <span className="text-muted-foreground">
                    Your spoken text will appear here as you speak...
                  </span>
                )}
              </p>
            </div>
          </div>
        </Card>

        {/* STEP 3 CTA + Results */}
        <div className="space-y-6">
          <Button
            onClick={() => setAnalyzed(true)}
            className="group h-14 w-full rounded-2xl bg-gradient-to-r from-primary to-violet-500 text-base font-semibold shadow-[0_10px_40px_-10px_oklch(0.62_0.22_295/0.6)] transition-all hover:from-primary hover:to-violet-400 hover:shadow-[0_15px_50px_-10px_oklch(0.62_0.22_295/0.8)] sm:h-16 sm:text-lg"
          >
            <Sparkles className="mr-2 h-5 w-5 transition-transform group-hover:rotate-12" />
            Analyze My Blurt with AI
          </Button>

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
                +3 Marks
              </Badge>
              <ul className="space-y-2">
                {MATCHED.map((m) => (
                  <li
                    key={m}
                    className="flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Missed */}
            <Card className="animate-in fade-in rounded-2xl border-rose-500/30 bg-rose-500/5 p-5 duration-500">
              <div className="mb-3 flex items-center gap-2">
                <XCircle className="h-5 w-5 text-rose-400" />
                <h3 className="font-semibold">Critical Gaps Missed</h3>
              </div>
              <Badge className="mb-4 rounded-full bg-rose-500/15 text-rose-300 hover:bg-rose-500/20">
                −2 Marks
              </Badge>
              <ul className="space-y-2">
                {MISSED.map((m) => (
                  <li
                    key={m}
                    className="flex items-start gap-2 rounded-xl bg-rose-500/10 px-3 py-2 text-sm"
                  >
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    <span>{m}</span>
                  </li>
                ))}
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
                {FEEDBACK.map((f) => (
                  <li
                    key={f.title}
                    className="rounded-xl bg-amber-500/10 p-3 text-sm"
                  >
                    <p className="font-medium text-amber-200">{f.title}</p>
                    <p className="mt-1 text-muted-foreground">{f.body}</p>
                  </li>
                ))}
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