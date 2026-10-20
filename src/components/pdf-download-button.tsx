"use client";

import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
import type { InspectionResult } from "@/lib/inspection/types";

export function PdfDownloadButton({ result }: { result: InspectionResult }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);

  useEffect(() => {
    setGenerating(false);
    setError("");
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [result]);

  async function download() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setGenerating(true);
    setError("");
    try {
      const { downloadInspectionPdf } = await import("@/lib/inspection/pdf");
      controller.signal.throwIfAborted();
      await downloadInspectionPdf(result, controller.signal);
    } catch {
      if (!controller.signal.aborted)
        setError("PDFを作成できませんでした。通信環境を確認して、もう一度お試しください。");
    } finally {
      if (active.current === controller) {
        active.current = null;
        setGenerating(false);
      }
    }
  }

  return (
    <div className="pdf-download">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void download()}
        disabled={generating}
        aria-busy={generating}
      >
        {generating ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />}
        {generating ? "PDF作成中…" : "PDFをダウンロード"}
      </Button>
      {error && (
        <p className="pdf-download-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
