import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

// Capture a DOM node and save it as a multi-page A4 PDF.
// Runs entirely in the browser — no backend, no login, no per-download cost.
export async function downloadElementAsPdf(element, filename = "document.pdf") {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;

  if (imgH <= pageH) {
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgW, imgH);
  } else {
    // Slice the tall canvas across multiple pages.
    const pxPerPt = canvas.width / imgW;
    const pageHpx = pageH * pxPerPt;
    let srcY = 0;
    let remaining = canvas.height;
    let first = true;
    while (remaining > 0) {
      const sliceH = Math.min(pageHpx, remaining);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = Math.ceil(sliceH);
      const ctx = pageCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (!first) pdf.addPage();
      pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", 0, 0, imgW, sliceH / pxPerPt);
      srcY += sliceH;
      remaining -= sliceH;
      first = false;
    }
  }

  pdf.save(filename);
}