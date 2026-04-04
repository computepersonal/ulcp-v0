import { useEffect, useRef } from "react";

interface Props {
  value: string;
  size?: number;
}

// Lightweight QR code display using a canvas drawn via the qrcode npm package
// Falls back to showing the URL as text if the library isn't available
export default function QRDisplay({ value, size = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    async function drawQR() {
      if (!canvasRef.current) return;
      try {
        // Dynamically import qrcode (lighter, no React peer dep issues)
        const QRCode = await import("qrcode");
        await QRCode.toCanvas(canvasRef.current, value, {
          width: size,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        });
      } catch {
        // If qrcode not available, draw a placeholder
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size, size);
          ctx.fillStyle = "#000000";
          ctx.font = "11px monospace";
          ctx.fillText("Scan URL:", 8, 20);
          ctx.fillText(value.slice(0, 22), 4, 36);
        }
      }
    }
    void drawQR();
  }, [value, size]);

  return <canvas ref={canvasRef} width={size} height={size} />;
}
