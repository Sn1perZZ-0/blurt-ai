// Client-side helpers: PDF -> text, image -> data URL.

export async function extractPdfText(file: File): Promise<string> {
  // Use legacy build for maximum cross-browser/iOS Safari compatibility
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Disable Web Worker creation entirely to bypass mobile Safari security blocks
  pdfjs.GlobalWorkerOptions.workerSrc = "";

  // Convert file stream to Uint8Array for Safari memory safety
  const arrayBuffer = await file.arrayBuffer();
  const typedArray = new Uint8Array(arrayBuffer);

  const loadingTask = pdfjs.getDocument({
    data: typedArray,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  });

  const doc = await loadingTask.promise;
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