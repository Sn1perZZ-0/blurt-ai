// Client-side helpers: PDF -> text, image -> data URL.

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  // Load worker locally via bundled worker module (Works on BOTH PC & Mobile)
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }

  // Convert to Uint8Array for iOS Safari/WebKit memory safety
  const arrayBuffer = await file.arrayBuffer();
  const typedArray = new Uint8Array(arrayBuffer);

  const doc = await pdfjs.getDocument({ data: typedArray }).promise;
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