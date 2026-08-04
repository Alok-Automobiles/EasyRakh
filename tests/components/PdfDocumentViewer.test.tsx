import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfDocumentViewer from '@/components/PdfDocumentViewer';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  getPage: vi.fn(),
  renderPage: vi.fn(),
  cancelRender: vi.fn(),
  destroyLoadingTask: vi.fn(),
  workerOptions: { workerPort: null as Worker | null },
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: mocks.getDocument,
  GlobalWorkerOptions: mocks.workerOptions,
}));

describe('PdfDocumentViewer', () => {
  beforeEach(() => {
    mocks.getDocument.mockReset();
    mocks.getPage.mockReset();
    mocks.renderPage.mockReset();
    mocks.cancelRender.mockReset();
    mocks.destroyLoadingTask.mockReset();
    mocks.workerOptions.workerPort = null;

    mocks.renderPage.mockReturnValue({
      promise: Promise.resolve(),
      cancel: mocks.cancelRender,
    });
    mocks.getPage.mockResolvedValue({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
      }),
      render: mocks.renderPage,
    });
    mocks.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: mocks.getPage,
      }),
      destroy: mocks.destroyLoadingTask,
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(new Uint8Array([37, 80, 68, 70, 45]), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      })
    ));
    vi.stubGlobal('Worker', class {
      constructor() {}
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as CanvasRenderingContext2D
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders PDF pages inside the dialog content without an iframe', async () => {
    render(<PdfDocumentViewer url="/api/transactions/transaction-1/bill" title="Bill PDF" />);

    expect(await screen.findByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Bill PDF, page 1 of 1' })).toBeInTheDocument();
    expect(document.querySelector('iframe')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/transactions/transaction-1/bill',
      expect.objectContaining({ credentials: 'same-origin' })
    );
    await waitFor(() => expect(mocks.renderPage).toHaveBeenCalledOnce());
  });
});
