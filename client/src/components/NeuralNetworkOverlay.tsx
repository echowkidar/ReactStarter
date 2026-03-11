import { useEffect } from "react";

// Neural Network CSS styles for the chat button
export const NeuralNetworkStyles = () => (
  <style>
    {`
      /* Neural network floating overlay - positioned independently from the button */
      .neural-network-overlay {
        position: fixed;
        pointer-events: none;
        z-index: 9998; /* just below the chat button z-index */
      }
      .neural-network-overlay svg {
        overflow: visible;
        display: block;
      }

      /* Orbit groups rotation */
      .orbit-ring-1 {
        animation: orbitSpin1 12s linear infinite;
      }
      .orbit-ring-2 {
        animation: orbitSpin2 18s linear infinite;
      }
      .orbit-ring-3 {
        animation: orbitSpin3 25s linear infinite;
      }

      @keyframes orbitSpin1 {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes orbitSpin2 {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(-360deg); }
      }
      @keyframes orbitSpin3 {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      /* Node pulse - bright LED effect */
      .neural-node {
        animation: nodePulse 2.5s ease-in-out infinite;
      }
      .neural-node-lg {
        animation: nodePulseLg 2s ease-in-out infinite;
      }

      @keyframes nodePulse {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 1; }
      }
      @keyframes nodePulseLg {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
      }

      /* Connection lines pulse */
      .neural-line {
        animation: linePulse 3s ease-in-out infinite;
      }

      @keyframes linePulse {
        0%, 100% { opacity: 0.15; }
        50% { opacity: 0.55; }
      }

      /* Hover effects - applied via JS class toggle */
      .neural-network-overlay.hovered .orbit-ring-1 { animation-duration: 5s; }
      .neural-network-overlay.hovered .orbit-ring-2 { animation-duration: 8s; }
      .neural-network-overlay.hovered .orbit-ring-3 { animation-duration: 12s; }
      .neural-network-overlay.hovered .neural-node { animation-duration: 1s; }
      .neural-network-overlay.hovered .neural-node-lg { animation-duration: 0.8s; }
      .neural-network-overlay.hovered .neural-line { animation-duration: 1.5s; }
    `}
  </style>
);

// Neural Network SVG overlay - creates a body-level overlay positioned behind the chat button
export const NeuralNetworkOverlay = () => {
  useEffect(() => {
    let overlayEl: HTMLDivElement | null = null;
    let animFrame: number;
    let handleMouseOver: (e: MouseEvent) => void;
    let handleMouseOut: (e: MouseEvent) => void;

    const injectNeuralNet = () => {
      const toggleBtn = document.querySelector('.chat-window-toggle') as HTMLElement;
      if (!toggleBtn || document.querySelector('.neural-network-overlay')) return;

      const svgSize = 220;
      const center = svgSize / 2;
      const svgNS = 'http://www.w3.org/2000/svg';

      // Create overlay container as a direct child of body
      overlayEl = document.createElement('div');
      overlayEl.className = 'neural-network-overlay';

      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', String(svgSize));
      svg.setAttribute('height', String(svgSize));
      svg.setAttribute('viewBox', `0 0 ${svgSize} ${svgSize}`);

      // ---- DEFS ----
      const defs = document.createElementNS(svgNS, 'defs');

      // Gradients
      const gradientDefs: [string, string, string][] = [
        ['nn-g1', '#3b82f6', '#8b5cf6'],
        ['nn-g2', '#a855f7', '#ec4899'],
        ['nn-g3', '#22d3ee', '#6366f1'],
        ['nn-g4', '#ec4899', '#f97316'],
      ];
      gradientDefs.forEach(([id, c1, c2]) => {
        const grad = document.createElementNS(svgNS, 'linearGradient');
        grad.id = id;
        const s1 = document.createElementNS(svgNS, 'stop');
        s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', c1); s1.setAttribute('stop-opacity', '0.8');
        const s2 = document.createElementNS(svgNS, 'stop');
        s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', c2); s2.setAttribute('stop-opacity', '0.8');
        grad.appendChild(s1); grad.appendChild(s2);
        defs.appendChild(grad);
      });

      // Glow filters
      const createFilter = (id: string, stdDev: string, mergeCount: number) => {
        const f = document.createElementNS(svgNS, 'filter');
        f.id = id;
        f.setAttribute('x', '-100%'); f.setAttribute('y', '-100%');
        f.setAttribute('width', '300%'); f.setAttribute('height', '300%');
        const b = document.createElementNS(svgNS, 'feGaussianBlur');
        b.setAttribute('stdDeviation', stdDev); b.setAttribute('result', 'blur');
        f.appendChild(b);
        const m = document.createElementNS(svgNS, 'feMerge');
        for (let i = 0; i < mergeCount; i++) {
          const mn = document.createElementNS(svgNS, 'feMergeNode');
          mn.setAttribute('in', 'blur');
          m.appendChild(mn);
        }
        const mnSrc = document.createElementNS(svgNS, 'feMergeNode');
        mnSrc.setAttribute('in', 'SourceGraphic');
        m.appendChild(mnSrc);
        f.appendChild(m);
        defs.appendChild(f);
      };
      createFilter('glow', '3', 1);
      createFilter('glow-bright', '4', 2);

      svg.appendChild(defs);

      // (orbit ring ellipses removed - nodes and lines are sufficient)

      // ---- NODES & CONNECTIONS ----
      const rings = [
        {
          rx: 42, ry: 36, count: 5, cls: 'orbit-ring-1',
          colors: ['#3b82f6', '#6366f1', '#8b5cf6', '#22d3ee', '#3b82f6'],
          sizes: [5, 7, 5, 6, 5]
        },
        {
          rx: 62, ry: 53, count: 8, cls: 'orbit-ring-2',
          colors: ['#a855f7', '#ec4899', '#f472b6', '#8b5cf6', '#6366f1', '#22d3ee', '#a855f7', '#ec4899'],
          sizes: [6, 5, 7, 5, 6, 5, 7, 5]
        },
        {
          rx: 82, ry: 70, count: 7, cls: 'orbit-ring-3',
          colors: ['#22d3ee', '#3b82f6', '#a855f7', '#ec4899', '#6366f1', '#2dd4bf', '#f472b6'],
          sizes: [6, 8, 5, 7, 5, 6, 7]
        },
      ];

      const allNodes: { x: number; y: number; ringIdx: number }[] = [];

      rings.forEach((ring, rIdx) => {
        const group = document.createElementNS(svgNS, 'g');
        group.setAttribute('class', ring.cls);
        group.setAttribute('transform-origin', `${center} ${center}`);
        const rn: { x: number; y: number }[] = [];

        for (let i = 0; i < ring.count; i++) {
          const angle = (2 * Math.PI * i) / ring.count + (rIdx * 0.4);
          const x = center + ring.rx * Math.cos(angle);
          const y = center + ring.ry * Math.sin(angle);
          rn.push({ x, y });
          allNodes.push({ x, y, ringIdx: rIdx });

          const sz = ring.sizes[i];
          const isLg = sz >= 7;
          const delay = `${i * 0.35 + rIdx * 0.4}s`;

          // Colored glow circle (behind)
          const gc = document.createElementNS(svgNS, 'circle');
          gc.setAttribute('cx', String(x)); gc.setAttribute('cy', String(y));
          gc.setAttribute('r', String(sz));
          gc.setAttribute('fill', ring.colors[i]);
          gc.setAttribute('filter', isLg ? 'url(#glow-bright)' : 'url(#glow)');
          gc.setAttribute('class', isLg ? 'neural-node-lg' : 'neural-node');
          gc.style.animationDelay = delay;
          group.appendChild(gc);

          // White bright core (on top)
          const core = document.createElementNS(svgNS, 'circle');
          core.setAttribute('cx', String(x)); core.setAttribute('cy', String(y));
          core.setAttribute('r', String(sz * 0.45));
          core.setAttribute('fill', 'white');
          core.setAttribute('opacity', '0.85');
          core.setAttribute('class', isLg ? 'neural-node-lg' : 'neural-node');
          core.style.animationDelay = delay;
          group.appendChild(core);
        }

        // Connection lines: neighbor + skip + center
        for (let i = 0; i < rn.length; i++) {
          // Neighbor connection
          const next = (i + 1) % rn.length;
          const addLine = (x1: number, y1: number, x2: number, y2: number, gradIdx: number, sw: string, dly: string) => {
            const l = document.createElementNS(svgNS, 'line');
            l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
            l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
            l.setAttribute('stroke', `url(#nn-g${(gradIdx % 4) + 1})`);
            l.setAttribute('stroke-width', sw);
            l.setAttribute('class', 'neural-line');
            l.style.animationDelay = dly;
            group.appendChild(l);
          };

          addLine(rn[i].x, rn[i].y, rn[next].x, rn[next].y, rIdx + i, '1.3', `${i * 0.2}s`);

          // Skip connection
          if (i % 2 === 0 && ring.count > 3) {
            const skip = (i + 2) % rn.length;
            addLine(rn[i].x, rn[i].y, rn[skip].x, rn[skip].y, rIdx + i + 1, '0.8', `${i * 0.3}s`);
          }

          // Center connection
          if (i % 2 === 0) {
            addLine(rn[i].x, rn[i].y, center, center, rIdx + i + 2, '0.6', `${i * 0.25}s`);
          }
        }

        svg.appendChild(group);
      });

      // Cross-ring connections
      const cg = document.createElementNS(svgNS, 'g');
      cg.style.opacity = '0.6';
      for (let i = 0; i < 10; i++) {
        const a = allNodes[Math.floor(Math.random() * allNodes.length)];
        const b = allNodes[Math.floor(Math.random() * allNodes.length)];
        if (a === b || a.ringIdx === b.ringIdx) continue;
        const l = document.createElementNS(svgNS, 'line');
        l.setAttribute('x1', String(a.x)); l.setAttribute('y1', String(a.y));
        l.setAttribute('x2', String(b.x)); l.setAttribute('y2', String(b.y));
        l.setAttribute('stroke', `url(#nn-g${Math.floor(Math.random() * 4) + 1})`);
        l.setAttribute('stroke-width', '0.5');
        l.setAttribute('class', 'neural-line');
        l.style.animationDelay = `${Math.random() * 3}s`;
        cg.appendChild(l);
      }
      svg.appendChild(cg);

      overlayEl.appendChild(svg);
      document.body.appendChild(overlayEl);

      // Position overlay centered on the button, updated on resize/scroll
      const updatePosition = () => {
        if (!overlayEl) return;

        // Re-query dynamically to handle DOM changes, unmounts, or remounts gracefully
        const currentBtn = document.querySelector('.chat-window-toggle') as HTMLElement;

        if (!currentBtn) {
          overlayEl.style.opacity = '0';
          return;
        }

        const rect = currentBtn.getBoundingClientRect();

        // Hide overlay if button is hidden (0x0 rect) or detached
        if (rect.width === 0 || (rect.left === 0 && rect.top === 0)) {
          overlayEl.style.opacity = '0';
          return;
        } else {
          overlayEl.style.opacity = '1';
        }

        const btnCenterX = rect.left + rect.width / 2;
        const btnCenterY = rect.top + rect.height / 2;
        overlayEl.style.left = `${btnCenterX - svgSize / 2}px`;
        overlayEl.style.top = `${btnCenterY - svgSize / 2}px`;
        overlayEl.style.width = `${svgSize}px`;
        overlayEl.style.height = `${svgSize}px`;
      };

      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition);

      // Hover sync using event delegation
      handleMouseOver = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target && target.closest('.chat-window-toggle')) {
          overlayEl?.classList.add('hovered');
        }
      };
      handleMouseOut = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target && target.closest('.chat-window-toggle')) {
          overlayEl?.classList.remove('hovered');
        }
      };

      document.body.addEventListener('mouseover', handleMouseOver);
      document.body.addEventListener('mouseout', handleMouseOut);

      // Keep position updated
      const posLoop = () => {
        updatePosition();
        animFrame = requestAnimationFrame(posLoop);
      };
      animFrame = requestAnimationFrame(posLoop);
    };

    // Watch for the chat button to appear
    const observer = new MutationObserver(() => {
      injectNeuralNet();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(injectNeuralNet, 2000);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
      if (animFrame) cancelAnimationFrame(animFrame);
      if (handleMouseOver) document.body.removeEventListener('mouseover', handleMouseOver);
      if (handleMouseOut) document.body.removeEventListener('mouseout', handleMouseOut);
      if (overlayEl && overlayEl.parentNode) {
        overlayEl.parentNode.removeChild(overlayEl);
      }
    };
  }, []);

  return null;
};
