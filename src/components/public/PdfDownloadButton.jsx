import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadElementAsPdf } from "@/lib/publicPdf";

export default function PdfDownloadButton({ targetRef, filename, label = "Download PDF", className = "" }) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    const el = targetRef?.current;
    if (!el || busy) return;
    setBusy(true);
    try {
      await downloadElementAsPdf(el, filename);
    } catch {
      // Silent on public pages — no account/error surface to lean on.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" className={`gap-2 ${className}`} onClick={onClick} disabled={busy}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      {label}
    </Button>
  );
}