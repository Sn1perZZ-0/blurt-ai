// Client-side helpers: PDF -> text, image -> data URL.

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  // Load exact version-matched worker via HTTPS CDN to prevent iOS worker bundle crashes
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  // 1. Read arrayBuffer and convert to Uint8Array for Safari WebKit safety
  const arrayBuffer = await file.arrayBuffer();
  const typedArray = new Uint8Array(arrayBuffer);

  // 2. Load document using typed array
  const loadingTask = pdfjs.getDocument({
    data: typedArray,
    useSystemFonts: true, // Prevents iOS font rendering freezes
    disableFontFace: true,
  });

  const doc = await loadingTask.promise;
  const out: string[] = [];
  const max = Math.min(doc.numPages, 30);

  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .join(" ");
    out.push(line);
  }

  return out.join("\n\n").replace(/\s+\n/g, "\n").trim();
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}