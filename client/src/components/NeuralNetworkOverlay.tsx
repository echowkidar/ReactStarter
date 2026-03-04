import { useEffect } from "react";

// Neural Network CSS styles for the chat button
export const NeuralNetworkStyles = () => (
    <style>
        {`
      .neural-net-container { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; z-index: -1; }
      .neural-net-container svg { overflow: visible; display: block; }
      .neural-glow-ring {
        position: absolute; top: 50%; left: 50%; width: 110%; height: 110%; transform: translate(-50%, -50%);
        border-radius: 50%; pointer-events: none; z-index: -1;
        box-shadow: 0 0 10px 3px rgba(99,102,241,0.4), 0 0 25px 5px rgba(139,92,246,0.2), 0 0 40px 8px rgba(236,72,153,0.1);
        animation: glowPulse 3s ease-in-out infinite;
      }
      @keyframes glowPulse {
        0%, 100% { box-shadow: 0 0 10px 3px rgba(99,102,241,0.4), 0 0 25px 5px rgba(139,92,246,0.2), 0 0 40px 8px rgba(236,72,153,0.1); transform: translate(-50%,-50%) scale(1); }
        50% { box-shadow: 0 0 15px 5px rgba(139,92,246,0.5), 0 0 35px 8px rgba(236,72,153,0.25), 0 0 50px 12px rgba(59,130,246,0.15); transform: translate(-50%,-50%) scale(1.06); }
      }
      .orbit-ring-1 { animation: orbitSpin1 12s linear infinite; transform-origin: center; }
      .orbit-ring-2 { animation: orbitSpin2 18s linear infinite; transform-origin: center; }
      .orbit-ring-3 { animation: orbitSpin3 25s linear infinite; transform-origin: center; }
      @keyframes orbitSpin1 { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      @keyframes orbitSpin2 { 0% { transform: rotate(0deg); } 100% { transform: rotate(-360deg); } }
      @keyframes orbitSpin3 { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      .neural-node { animation: nodePulse 2s ease-in-out infinite; }
      .neural-node:nth-child(2) { animation-delay: 0.3s; }
      .neural-node:nth-child(3) { animation-delay: 0.6s; }
      .neural-node:nth-child(4) { animation-delay: 0.9s; }
      .neural-node:nth-child(5) { animation-delay: 1.2s; }
      @keyframes nodePulse { 0%, 100% { opacity: 0.5; r: 2.5; } 50% { opacity: 1; r: 4; } }
      .neural-line { animation: linePulse 3s ease-in-out infinite; }
      .neural-line:nth-child(2n) { animation-delay: 0.5s; }
      .neural-line:nth-child(3n) { animation-delay: 1s; }
      @keyframes linePulse { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.45; } }
      .chat-window-toggle:hover .orbit-ring-1 { animation-duration: 5s; }
      .chat-window-toggle:hover .orbit-ring-2 { animation-duration: 8s; }
      .chat-window-toggle:hover .orbit-ring-3 { animation-duration: 12s; }
      .chat-window-toggle:hover .neural-node { animation-duration: 1s; }
      .chat-window-toggle:hover .neural-line { animation-duration: 1.5s; }
      .chat-window-toggle:hover .neural-glow-ring {
        box-shadow: 0 0 18px 6px rgba(99,102,241,0.6), 0 0 40px 10px rgba(139,92,246,0.35), 0 0 60px 15px rgba(236,72,153,0.2);
        animation-duration: 1.5s;
      }
    `}
    </style>
);

// Neural Network SVG overlay - injects animated nodes and connections into the chat button
export const NeuralNetworkOverlay = () => {
    useEffect(() => {
        const injectNeuralNet = () => {
            const toggleBtn = document.querySelector('.chat-window-toggle') as HTMLElement;
            if (!toggleBtn || toggleBtn.querySelector('.neural-net-container')) return;

            toggleBtn.style.position = 'relative';

            const size = 140;
            const center = size / 2;
            const svgNS = 'http://www.w3.org/2000/svg';

            const container = document.createElement('div');
            container.className = 'neural-net-container';
            container.style.width = size + 'px';
            container.style.height = size + 'px';

            const svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('width', String(size));
            svg.setAttribute('height', String(size));
            svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

            // Gradient definitions
            const defs = document.createElementNS(svgNS, 'defs');
            const gradients: [string, string, string][] = [
                ['nn-grad-1', '#3b82f6', '#8b5cf6'],
                ['nn-grad-2', '#a855f7', '#ec4899'],
                ['nn-grad-3', '#22d3ee', '#6366f1'],
            ];
            gradients.forEach(([id, c1, c2]) => {
                const grad = document.createElementNS(svgNS, 'linearGradient');
                grad.id = id;
                [c1, c2].forEach((color, i) => {
                    const stop = document.createElementNS(svgNS, 'stop');
                    stop.setAttribute('offset', i === 0 ? '0%' : '100%');
                    stop.setAttribute('stop-color', color);
                    stop.setAttribute('stop-opacity', '0.6');
                    grad.appendChild(stop);
                });
                defs.appendChild(grad);
            });

            // Glow filter
            const filter = document.createElementNS(svgNS, 'filter');
            filter.id = 'nn-glow';
            filter.setAttribute('x', '-50%');
            filter.setAttribute('y', '-50%');
            filter.setAttribute('width', '200%');
            filter.setAttribute('height', '200%');
            const blur = document.createElementNS(svgNS, 'feGaussianBlur');
            blur.setAttribute('stdDeviation', '2');
            blur.setAttribute('result', 'coloredBlur');
            filter.appendChild(blur);
            const merge = document.createElementNS(svgNS, 'feMerge');
            const mn1 = document.createElementNS(svgNS, 'feMergeNode');
            mn1.setAttribute('in', 'coloredBlur');
            const mn2 = document.createElementNS(svgNS, 'feMergeNode');
            mn2.setAttribute('in', 'SourceGraphic');
            merge.appendChild(mn1);
            merge.appendChild(mn2);
            filter.appendChild(merge);
            defs.appendChild(filter);
            svg.appendChild(defs);

            // 3 orbiting rings with nodes and connections
            const rings = [
                { radius: 32, count: 5, className: 'orbit-ring-1', colors: ['#3b82f6', '#6366f1', '#8b5cf6', '#3b82f6', '#22d3ee'] },
                { radius: 45, count: 7, className: 'orbit-ring-2', colors: ['#a855f7', '#ec4899', '#f472b6', '#8b5cf6', '#6366f1', '#22d3ee', '#a855f7'] },
                { radius: 58, count: 6, className: 'orbit-ring-3', colors: ['#22d3ee', '#3b82f6', '#a855f7', '#ec4899', '#6366f1', '#2dd4bf'] },
            ];

            const allNodes: { x: number; y: number }[] = [];

            rings.forEach((ring) => {
                const group = document.createElementNS(svgNS, 'g');
                group.setAttribute('class', ring.className);
                const ringNodes: { x: number; y: number }[] = [];

                for (let i = 0; i < ring.count; i++) {
                    const angle = (2 * Math.PI * i) / ring.count;
                    const x = center + ring.radius * Math.cos(angle);
                    const y = center + ring.radius * Math.sin(angle);
                    ringNodes.push({ x, y });
                    allNodes.push({ x, y });

                    const circle = document.createElementNS(svgNS, 'circle');
                    circle.setAttribute('cx', String(x));
                    circle.setAttribute('cy', String(y));
                    circle.setAttribute('r', '3');
                    circle.setAttribute('fill', ring.colors[i]);
                    circle.setAttribute('filter', 'url(#nn-glow)');
                    circle.setAttribute('class', 'neural-node');
                    circle.style.animationDelay = `${i * 0.4}s`;
                    group.appendChild(circle);
                }

                // Intra-ring connections (random subset)
                for (let i = 0; i < ringNodes.length; i++) {
                    for (let j = i + 1; j < ringNodes.length; j++) {
                        if (Math.random() > 0.5) continue;
                        const line = document.createElementNS(svgNS, 'line');
                        line.setAttribute('x1', String(ringNodes[i].x));
                        line.setAttribute('y1', String(ringNodes[i].y));
                        line.setAttribute('x2', String(ringNodes[j].x));
                        line.setAttribute('y2', String(ringNodes[j].y));
                        line.setAttribute('stroke', `url(#nn-grad-${Math.floor(Math.random() * 3) + 1})`);
                        line.setAttribute('stroke-width', '0.6');
                        line.setAttribute('class', 'neural-line');
                        line.style.animationDelay = `${Math.random() * 2}s`;
                        group.appendChild(line);
                    }

                    // Lines from node to center
                    if (Math.random() > 0.4) {
                        const line = document.createElementNS(svgNS, 'line');
                        line.setAttribute('x1', String(ringNodes[i].x));
                        line.setAttribute('y1', String(ringNodes[i].y));
                        line.setAttribute('x2', String(center));
                        line.setAttribute('y2', String(center));
                        line.setAttribute('stroke', `url(#nn-grad-${Math.floor(Math.random() * 3) + 1})`);
                        line.setAttribute('stroke-width', '0.4');
                        line.setAttribute('class', 'neural-line');
                        line.style.animationDelay = `${Math.random() * 2}s`;
                        group.appendChild(line);
                    }
                }

                svg.appendChild(group);
            });

            // Cross-ring connections
            const crossGroup = document.createElementNS(svgNS, 'g');
            crossGroup.setAttribute('class', 'orbit-ring-1');
            for (let i = 0; i < 8; i++) {
                const a = allNodes[Math.floor(Math.random() * allNodes.length)];
                const b = allNodes[Math.floor(Math.random() * allNodes.length)];
                if (a === b) continue;
                const line = document.createElementNS(svgNS, 'line');
                line.setAttribute('x1', String(a.x));
                line.setAttribute('y1', String(a.y));
                line.setAttribute('x2', String(b.x));
                line.setAttribute('y2', String(b.y));
                line.setAttribute('stroke', `url(#nn-grad-${Math.floor(Math.random() * 3) + 1})`);
                line.setAttribute('stroke-width', '0.3');
                line.setAttribute('class', 'neural-line');
                line.style.animationDelay = `${Math.random() * 3}s`;
                crossGroup.appendChild(line);
            }
            svg.appendChild(crossGroup);

            container.appendChild(svg);

            // Glow ring element
            const glowRing = document.createElement('div');
            glowRing.className = 'neural-glow-ring';
            toggleBtn.appendChild(glowRing);
            toggleBtn.appendChild(container);
        };

        // Watch for the chat button to appear (it's injected by n8n externally)
        const observer = new MutationObserver(() => {
            injectNeuralNet();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const timer = setTimeout(injectNeuralNet, 2000);

        return () => {
            observer.disconnect();
            clearTimeout(timer);
        };
    }, []);

    return null;
};
