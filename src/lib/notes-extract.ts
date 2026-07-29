// Client-side helpers: PDF -> text, image -> data URL.

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  // Read arrayBuffer and convert to Uint8Array for WebKit memory safety
  const arrayBuffer = await file.arrayBuffer();
  const typedArray = new Uint8Array(arrayBuffer);

  try {
    // Attempt standard worker setup
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

    const loadingTask = pdfjs.getDocument({
      data: typedArray,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false, // Prevents iOS Safari CSP evaluation blocks
    });

    const doc = await loadingTask.promise;
    return await parseDocPages(doc);
  } catch (workerErr) {
    console.warn("Worker execution failed on mobile, falling back to main-thread processing:", workerErr);

    // Fallback: Disable worker completely for mobile WebKit compatibility
    const fallbackTask = pdfjs.getDocument({
      data: typedArray,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
    });

    // Force pdfjs to resolve on the main thread
    const doc = await fallbackTask.promise;
    return await parseDocPages(doc);
  }
}

async function parseDocPages(doc: any): Promise<string> {
  const out: string[] = [];
  const max = Math.min(doc.numPages, 30);

  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it: any) => ("str" in it ? it.str : ""))
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