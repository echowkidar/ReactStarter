import { useState, useEffect, useRef, useCallback } from "react";

/**
 * SplashScreen — AMU AI intro animation
 * 
 * Phase 1 (2.5s): Logo large + centered with neural network on dark bg
 * Phase 2 (1.2s): Logo smoothly shrinks + flies to bottom-right corner
 * Phase 3: Overlay fades out, login page revealed
 */

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [phase, setPhase] = useState<'center' | 'moving' | 'fading' | 'done'>('center');
  const svgRef = useRef<SVGSVGElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Calculate and apply the move animation using JS for precise positioning
  const startMoveAnimation = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;

    // Target: bottom-right corner where chat button is (bottom: 40px, right: 25px)
    // Chat button center: (window.innerWidth - 25 - 40, window.innerHeight - 40 - 40)
    const targetX = window.innerWidth - 25 - 40; // ~right edge - 65px
    const targetY = window.innerHeight - 40 - 40; // ~bottom edge - 80px
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    // How far to translate from center
    const dx = targetX - centerX;
    const dy = targetY - centerY;

    // Apply transition + transform
    el.style.transition = 'transform 1.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 1.2s ease';
    el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.2)`;
    el.style.opacity = '0';
  }, []);

  useEffect(() => {
    // Phase 1: Show centered for 2.5s
    const t1 = setTimeout(() => {
      setPhase('moving');
      startMoveAnimation();
    }, 2500);

    // Phase 2: After move completes (1.2s), start fading overlay
    const t2 = setTimeout(() => {
      setPhase('fading');
    }, 2500 + 1300);

    // Phase 3: Overlay fade done (0.5s), complete
    const t3 = setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 2500 + 1300 + 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete, startMoveAnimation]);

  // Draw neural network SVG
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const svgNS = 'http://www.w3.org/2000/svg';
    const size = 300;
    const center = size / 2;

    // Defs
    const defs = document.createElementNS(svgNS, 'defs');
    const gradients: [string, string, string][] = [
      ['sp-g1', '#3b82f6', '#8b5cf6'],
      ['sp-g2', '#a855f7', '#ec4899'],
      ['sp-g3', '#22d3ee', '#6366f1'],
      ['sp-g4', '#ec4899', '#f97316'],
    ];
    gradients.forEach(([id, c1, c2]) => {
      const g = document.createElementNS(svgNS, 'linearGradient');
      g.id = id;
      const s1 = document.createElementNS(svgNS, 'stop');
      s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', c1); s1.setAttribute('stop-opacity', '0.9');
      const s2 = document.createElementNS(svgNS, 'stop');
      s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', c2); s2.setAttribute('stop-opacity', '0.9');
      g.appendChild(s1); g.appendChild(s2);
      defs.appendChild(g);
    });

    // Glow filters
    const addFilter = (id: string, std: string, count: number) => {
      const f = document.createElementNS(svgNS, 'filter');
      f.id = id;
      f.setAttribute('x', '-100%'); f.setAttribute('y', '-100%');
      f.setAttribute('width', '300%'); f.setAttribute('height', '300%');
      const b = document.createElementNS(svgNS, 'feGaussianBlur');
      b.setAttribute('stdDeviation', std); b.setAttribute('result', 'blur');
      f.appendChild(b);
      const m = document.createElementNS(svgNS, 'feMerge');
      for (let i = 0; i < count; i++) {
        const mn = document.createElementNS(svgNS, 'feMergeNode');
        mn.setAttribute('in', 'blur');
        m.appendChild(mn);
      }
      const ms = document.createElementNS(svgNS, 'feMergeNode');
      ms.setAttribute('in', 'SourceGraphic');
      m.appendChild(ms);
      f.appendChild(m);
      defs.appendChild(f);
    };
    addFilter('sp-glow', '4', 1);
    addFilter('sp-glow-bright', '6', 2);
    svg.appendChild(defs);

    // Rings of nodes
    const rings = [
      { rx: 65, ry: 55, count: 6, colors: ['#3b82f6', '#6366f1', '#8b5cf6', '#22d3ee', '#a855f7', '#3b82f6'], sizes: [7, 9, 6, 8, 7, 6] },
      { rx: 95, ry: 80, count: 10, colors: ['#a855f7', '#ec4899', '#f472b6', '#8b5cf6', '#6366f1', '#22d3ee', '#a855f7', '#ec4899', '#3b82f6', '#2dd4bf'], sizes: [8, 6, 9, 7, 8, 6, 9, 7, 8, 6] },
      { rx: 125, ry: 105, count: 8, colors: ['#22d3ee', '#3b82f6', '#a855f7', '#ec4899', '#6366f1', '#2dd4bf', '#f472b6', '#8b5cf6'], sizes: [7, 10, 7, 9, 6, 8, 7, 9] },
    ];

    const allNodes: { x: number; y: number; rIdx: number }[] = [];
    const animClasses = ['splash-ring-1', 'splash-ring-2', 'splash-ring-3'];

    rings.forEach((ring, rIdx) => {
      const group = document.createElementNS(svgNS, 'g');
      group.setAttribute('class', animClasses[rIdx]);
      const rn: { x: number; y: number }[] = [];

      for (let i = 0; i < ring.count; i++) {
        const angle = (2 * Math.PI * i) / ring.count + (rIdx * 0.3);
        const x = center + ring.rx * Math.cos(angle);
        const y = center + ring.ry * Math.sin(angle);
        rn.push({ x, y });
        allNodes.push({ x, y, rIdx });

        const sz = ring.sizes[i];
        const isLg = sz >= 9;
        const delay = `${i * 0.25 + rIdx * 0.3}s`;

        // Glow circle
        const gc = document.createElementNS(svgNS, 'circle');
        gc.setAttribute('cx', String(x)); gc.setAttribute('cy', String(y));
        gc.setAttribute('r', String(sz));
        gc.setAttribute('fill', ring.colors[i]);
        gc.setAttribute('filter', isLg ? 'url(#sp-glow-bright)' : 'url(#sp-glow)');
        gc.setAttribute('class', 'splash-node');
        gc.style.animationDelay = delay;
        group.appendChild(gc);

        // White core
        const core = document.createElementNS(svgNS, 'circle');
        core.setAttribute('cx', String(x)); core.setAttribute('cy', String(y));
        core.setAttribute('r', String(sz * 0.4));
        core.setAttribute('fill', 'white');
        core.setAttribute('opacity', '0.9');
        core.setAttribute('class', 'splash-node');
        core.style.animationDelay = delay;
        group.appendChild(core);
      }

      // Connection lines
      for (let i = 0; i < rn.length; i++) {
        const next = (i + 1) % rn.length;
        const addLine = (x1: number, y1: number, x2: number, y2: number, gIdx: number, sw: string, d: string) => {
          const l = document.createElementNS(svgNS, 'line');
          l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
          l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
          l.setAttribute('stroke', `url(#sp-g${(gIdx % 4) + 1})`);
          l.setAttribute('stroke-width', sw);
          l.setAttribute('class', 'splash-line');
          l.style.animationDelay = d;
          group.appendChild(l);
        };
        addLine(rn[i].x, rn[i].y, rn[next].x, rn[next].y, rIdx + i, '1.5', `${i * 0.15}s`);
        if (i % 2 === 0 && ring.count > 4) {
          const skip = (i + 2) % rn.length;
          addLine(rn[i].x, rn[i].y, rn[skip].x, rn[skip].y, rIdx + i + 1, '0.8', `${i * 0.2}s`);
        }
        if (i % 3 === 0) {
          addLine(rn[i].x, rn[i].y, center, center, rIdx + i + 2, '0.6', `${i * 0.2}s`);
        }
      }
      svg.appendChild(group);
    });

    // Cross-ring lines
    const cg = document.createElementNS(svgNS, 'g');
    cg.style.opacity = '0.5';
    for (let i = 0; i < 12; i++) {
      const a = allNodes[Math.floor(Math.random() * allNodes.length)];
      const b = allNodes[Math.floor(Math.random() * allNodes.length)];
      if (a === b || a.rIdx === b.rIdx) continue;
      const l = document.createElementNS(svgNS, 'line');
      l.setAttribute('x1', String(a.x)); l.setAttribute('y1', String(a.y));
      l.setAttribute('x2', String(b.x)); l.setAttribute('y2', String(b.y));
      l.setAttribute('stroke', `url(#sp-g${Math.floor(Math.random() * 4) + 1})`);
      l.setAttribute('stroke-width', '0.5');
      l.setAttribute('class', 'splash-line');
      l.style.animationDelay = `${Math.random() * 2}s`;
      cg.appendChild(l);
    }
    svg.appendChild(cg);
  }, []);

  if (phase === 'done') return null;

  return (
    <>
      <style>{`
        .splash-overlay {
          position: fixed;
          inset: 0;
          z-index: 99999;
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .splash-overlay.phase-fading {
          animation: overlayFadeOut 0.5s ease-out forwards;
        }
        @keyframes overlayFadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }

        /* Content: starts centered via fixed positioning */
        .splash-content {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) scale(1);
          opacity: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 100000;
          /* transition is applied via JS for the move phase */
        }

        .splash-logo-container {
          position: relative;
          width: 160px;
          height: 160px;
          border-radius: 50%;
          overflow: hidden;
          box-shadow:
            0 0 30px 10px rgba(99, 102, 241, 0.4),
            0 0 60px 20px rgba(139, 92, 246, 0.2),
            0 0 100px 30px rgba(236, 72, 153, 0.1);
          animation: logoGlow 2s ease-in-out infinite;
        }
        .splash-logo-container img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        @keyframes logoGlow {
          0%, 100% {
            box-shadow:
              0 0 30px 10px rgba(99, 102, 241, 0.4),
              0 0 60px 20px rgba(139, 92, 246, 0.2),
              0 0 100px 30px rgba(236, 72, 153, 0.1);
          }
          50% {
            box-shadow:
              0 0 40px 15px rgba(139, 92, 246, 0.5),
              0 0 80px 25px rgba(236, 72, 153, 0.3),
              0 0 120px 40px rgba(59, 130, 246, 0.15);
          }
        }

        .splash-neural-svg {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        .splash-neural-svg svg {
          overflow: visible;
        }

        .splash-title {
          margin-top: 24px;
          font-size: 28px;
          font-weight: 700;
          color: white;
          letter-spacing: 3px;
          text-shadow: 0 0 20px rgba(99, 102, 241, 0.5), 0 0 40px rgba(139, 92, 246, 0.3);
          animation: titleFadeIn 0.8s ease-out forwards;
        }
        .splash-subtitle {
          margin-top: 8px;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
          letter-spacing: 2px;
          animation: titleFadeIn 1s ease-out forwards;
        }

        @keyframes titleFadeIn {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        /* Neural ring spin animations */
        .splash-ring-1 {
          animation: splashSpin1 8s linear infinite;
          transform-origin: 150px 150px;
        }
        .splash-ring-2 {
          animation: splashSpin2 12s linear infinite;
          transform-origin: 150px 150px;
        }
        .splash-ring-3 {
          animation: splashSpin3 16s linear infinite;
          transform-origin: 150px 150px;
        }
        @keyframes splashSpin1 { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes splashSpin2 { 0% { transform: rotate(0deg); } 100% { transform: rotate(-360deg); } }
        @keyframes splashSpin3 { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        .splash-node {
          animation: splashNodePulse 1.8s ease-in-out infinite;
        }
        @keyframes splashNodePulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        .splash-line {
          animation: splashLinePulse 2.5s ease-in-out infinite;
        }
        @keyframes splashLinePulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.55; }
        }
      `}</style>

      <div className={`splash-overlay ${phase === 'fading' ? 'phase-fading' : ''}`}>
        <div ref={contentRef} className="splash-content">
          {/* Neural network SVG behind the logo */}
          <div style={{ position: 'relative' }}>
            <div className="splash-neural-svg">
              <svg ref={svgRef} width="300" height="300" viewBox="0 0 300 300" />
            </div>
            {/* Logo */}
            <div className="splash-logo-container">
              <img src="/logo_favicon/amuai_logo.webp" alt="AMU AI" />
            </div>
          </div>
          <div className="splash-title">AMU AI</div>
          <div className="splash-subtitle">Intelligent Attendance System</div>
        </div>
      </div>
    </>
  );
};
