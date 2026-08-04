'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

interface PdfDocumentViewerProps {
  url: string;
  title?: string;
  className?: string;
}

let pdfWorker: Worker | null = null;

export default function PdfDocumentViewer({
  url,
  title = 'PDF document',
  className = '',
}: PdfDocumentViewerProps) {
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [renderAttempt, setRenderAttempt] = useState(0);

  useEffect(() => {
    const pagesContainer = pagesRef.current;
    if (!pagesContainer || !url) return;

    const controller = new AbortController();
    let cancelled = false;
    let loadingTask: { destroy: () => Promise<void> } | undefined;
    const renderTasks: Array<{ cancel: () => void }> = [];

    pagesContainer.replaceChildren();
    setLoading(true);
    setError('');

    const renderPdf = async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (!pdfWorker) {
          pdfWorker = new Worker(
            new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
            { type: 'module' }
          );
        }
        pdfjs.GlobalWorkerOptions.workerPort = pdfWorker;

        const response = await fetch(url, {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('The PDF could not be loaded');
        }

        const pdfBytes = new Uint8Array(await response.arrayBuffer());
        const task = pdfjs.getDocument({ data: pdfBytes });
        loadingTask = task;
        const pdf = await task.promise;
        if (cancelled) return;

        const availableWidth = Math.max(pagesContainer.clientWidth - 24, 280);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;

          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const displayScale = Math.min(1.35, availableWidth / baseViewport.width);
          const renderViewport = page.getViewport({ scale: displayScale * pixelRatio });
          const displayWidth = baseViewport.width * displayScale;
          const displayHeight = baseViewport.height * displayScale;
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('PDF rendering is unavailable on this device');

          canvas.width = Math.ceil(renderViewport.width);
          canvas.height = Math.ceil(renderViewport.height);
          canvas.style.width = `${displayWidth}px`;
          canvas.style.height = `${displayHeight}px`;
          canvas.style.maxWidth = '100%';
          canvas.className = 'block rounded-md bg-white shadow-sm';
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `${title}, page ${pageNumber} of ${pdf.numPages}`);

          const pageShell = document.createElement('section');
          pageShell.className = 'flex flex-col items-center gap-2';
          const pageLabel = document.createElement('p');
          pageLabel.className = 'text-[11px] font-medium text-muted-foreground';
          pageLabel.textContent = `Page ${pageNumber} of ${pdf.numPages}`;
          pageShell.append(canvas, pageLabel);
          pagesContainer.append(pageShell);

          const renderTask = page.render({ canvas, canvasContext: context, viewport: renderViewport });
          renderTasks.push(renderTask);
          await renderTask.promise;
        }

        if (!cancelled) setLoading(false);
      } catch (renderError) {
        if (cancelled || controller.signal.aborted) return;
        console.error('Failed to render PDF:', renderError);
        pagesContainer.replaceChildren();
        setError('Unable to display this PDF. Please try again.');
        setLoading(false);
      }
    };

    renderPdf();

    return () => {
      cancelled = true;
      controller.abort();
      renderTasks.forEach((task) => task.cancel());
      void loadingTask?.destroy();
    };
  }, [renderAttempt, title, url]);

  return (
    <div
      role="document"
      aria-label={title}
      className={`relative min-h-52 overflow-y-auto overscroll-contain rounded-lg border bg-slate-100/70 p-3 sm:p-4 ${className}`}
    >
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/85">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading PDF…
          </div>
        </div>
      )}

      {error && (
        <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-4 text-center">
          <AlertCircle className="h-6 w-6 text-red-500" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => setRenderAttempt((attempt) => attempt + 1)}
            className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
          >
            Retry
          </button>
        </div>
      )}

      <div ref={pagesRef} className="space-y-4" />
    </div>
  );
}
