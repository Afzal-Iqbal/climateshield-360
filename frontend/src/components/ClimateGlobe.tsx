import React, { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

interface ClimateGlobeProps {
  heatLabel: string;
  heatValue: string;
  rainLabel: string;
  rainValue: string;
  riskLevel?: string | null;
}

const RISK_COLOR: Record<string, string> = {
  Low: '#34d399',
  Moderate: '#fbbf24',
  High: '#fb923c',
  Severe: '#f87171',
};

/**
 * A small rotating wire sphere. It does not invent a weather reading:
 * the caption is the heat and rain headlines already returned by the API.
 */
export const ClimateGlobe: React.FC<ClimateGlobeProps> = ({
  heatLabel,
  heatValue,
  rainLabel,
  rainValue,
  riskLevel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduceMotion = useReducedMotion();
  const color = RISK_COLOR[riskLevel || ''] || '#93c5fd';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let frame = 0;
    let raf = 0;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2 + 4;
      const radius = Math.min(width, height) * 0.34;
      const tilt = 0.45;
      const spin = reduceMotion ? 0.6 : frame * 0.01;
      context.clearRect(0, 0, width, height);

      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.strokeStyle = color;
      context.lineWidth = 1.5;
      context.stroke();

      context.save();
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.clip();
      for (let meridian = 0; meridian < 8; meridian += 1) {
        context.beginPath();
        for (let step = 0; step <= 40; step += 1) {
          const lat = (step / 40) * Math.PI - Math.PI / 2;
          const lon = meridian * (Math.PI / 4) + spin;
          const x = Math.cos(lat) * Math.sin(lon);
          const y = Math.sin(lat);
          const z = Math.cos(lat) * Math.cos(lon);
          const px = cx + x * radius;
          const py = cy + (y * Math.cos(tilt) + z * Math.sin(tilt)) * radius;
          if (step === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.strokeStyle = `${color}99`;
        context.lineWidth = 1;
        context.stroke();
      }
      context.restore();
      frame += 1;
      if (!reduceMotion) raf = window.requestAnimationFrame(draw);
    };

    draw();
    return () => window.cancelAnimationFrame(raf);
  }, [color, reduceMotion]);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low px-3 py-2">
      <canvas ref={canvasRef} width={92} height={92} aria-hidden="true" className="shrink-0" />
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">Warehouse headlines</p>
        <p className="text-sm font-semibold text-on-surface truncate">{heatLabel}: {heatValue}</p>
        <p className="text-sm text-on-surface-variant truncate">{rainLabel}: {rainValue}</p>
        <p className="font-mono text-[10px] text-on-surface-variant mt-1">
          {riskLevel ? `Heat level ${riskLevel}` : 'Heat level not loaded'}
        </p>
      </div>
    </div>
  );
};
