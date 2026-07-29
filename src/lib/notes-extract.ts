// Client-side helpers: PDF -> text, image -> data URL.

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  try {
    const typedArray = await readFileAsUint8Array(file);
    const workerUrl = (await import(
      "pdfjs-dist/build/pdf.worker.min.mjs?url"
    )) as { default: string };

    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
    const worker = pdfjs.PDFWorker.create({ name: "blurt-pdf-worker" });

    const loadingTask = pdfjs.getDocument({
      data: typedArray,
      useSystemFonts: true,
      disableFontFace: true,
      worker,
    });

    const doc = await loadingTask.promise;
    try {
      return await parseDocPages(doc);
    } finally {
      await doc.cleanup();
      worker.destroy();
    }
  } catch (err) {
    console.error("PDF extraction failed:", err);
    throw err;
  }
}

async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return new Uint8Array(await fileReaderToArrayBuffer(file));
  }
}

function fileReaderToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) {
        resolve(result);
      } else {
        reject(new Error("FileReader did not return an ArrayBuffer."));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
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