/**
 * Fundo de Ondas e Luzes Cósmicas — Ultra Moderno & Leve (GPU Accelerated)
 * Cria um ambiente dinâmico com ondas fluidas e auroras vibrantes.
 * Totalmente compatível e otimizado para os Modos Claro (Light) e Escuro (Dark).
 */

function iniciarFundoOndas() {
  if (document.getElementById('fundo-ondas-container')) return;

  const container = document.createElement('div');
  container.id = 'fundo-ondas-container';

  container.innerHTML = `
    <!-- Auroras Vivas / Mesh Gradients com Movimento Orgânico 3D -->
    <div class="aurora-orb aurora-1"></div>
    <div class="aurora-orb aurora-2"></div>
    <div class="aurora-orb aurora-3"></div>
    <div class="aurora-orb aurora-4"></div>

    <!-- Ondas Fluidas em Perspectiva Diagonal (Topo Direito -> Fundo Esquerdo) -->
    <div class="ondas-diagonais-wrap" id="ondas-diagonais">
      <svg class="onda-svg onda-svg-1" viewBox="0 0 1440 600" preserveAspectRatio="none">
        <path d="M0,160 C320,300 500,80 800,220 C1100,360 1280,180 1440,240 L1440,600 L0,600 Z" fill="url(#gradOnda1)"></path>
        <defs>
          <linearGradient id="gradOnda1" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" class="stop-onda1-1"/>
            <stop offset="50%" class="stop-onda1-2"/>
            <stop offset="100%" class="stop-onda1-3"/>
          </linearGradient>
        </defs>
      </svg>

      <svg class="onda-svg onda-svg-2" viewBox="0 0 1440 600" preserveAspectRatio="none">
        <path d="M0,280 C360,140 640,380 960,200 C1200,80 1360,280 1440,220 L1440,600 L0,600 Z" fill="url(#gradOnda2)"></path>
        <defs>
          <linearGradient id="gradOnda2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" class="stop-onda2-1"/>
            <stop offset="50%" class="stop-onda2-2"/>
            <stop offset="100%" class="stop-onda2-3"/>
          </linearGradient>
        </defs>
      </svg>

      <svg class="onda-svg onda-svg-3" viewBox="0 0 1440 600" preserveAspectRatio="none">
        <path d="M0,100 C400,260 700,60 1000,200 C1250,320 1380,140 1440,180 L1440,600 L0,600 Z" fill="url(#gradOnda3)"></path>
        <defs>
          <linearGradient id="gradOnda3" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" class="stop-onda3-1"/>
            <stop offset="60%" class="stop-onda3-2"/>
            <stop offset="100%" class="stop-onda3-3"/>
          </linearGradient>
        </defs>
      </svg>
    </div>

    <!-- Ponto de Iluminação Dinâmico que segue o Mouse suavemente -->
    <div id="luz-cursor-glow" class="cursor-glow"></div>
  `;

  if (!document.getElementById('estilo-fundo-ondas-moderno')) {
    const style = document.createElement('style');
    style.id = 'estilo-fundo-ondas-moderno';
    style.textContent = `
      :root {
        --fundo-ondas-bg: #f6f8fc;
        --aurora-opacity: 0.35;
        --aurora-1-bg: radial-gradient(circle, rgba(124, 58, 237, 0.16) 0%, rgba(168, 85, 247, 0.08) 45%, transparent 70%);
        --aurora-2-bg: radial-gradient(circle, rgba(2, 132, 199, 0.16) 0%, rgba(56, 189, 248, 0.08) 45%, transparent 70%);
        --aurora-3-bg: radial-gradient(circle, rgba(236, 72, 153, 0.13) 0%, rgba(139, 92, 246, 0.07) 50%, transparent 70%);
        --aurora-4-bg: radial-gradient(circle, rgba(6, 182, 212, 0.14) 0%, rgba(124, 58, 237, 0.06) 50%, transparent 70%);
        --cursor-glow-bg: radial-gradient(circle, rgba(124, 58, 237, 0.07) 0%, rgba(56, 189, 248, 0.04) 35%, transparent 70%);
        
        --stop-onda1-1: rgba(236, 72, 153, 0.12);
        --stop-onda1-2: rgba(139, 92, 246, 0.10);
        --stop-onda1-3: rgba(59, 130, 246, 0.05);
        
        --stop-onda2-1: rgba(168, 85, 247, 0.11);
        --stop-onda2-2: rgba(6, 182, 212, 0.08);
        --stop-onda2-3: rgba(124, 58, 237, 0.04);
        
        --stop-onda3-1: rgba(56, 189, 248, 0.12);
        --stop-onda3-2: rgba(192, 132, 252, 0.08);
        --stop-onda3-3: rgba(2, 132, 199, 0.03);
      }

      [data-theme='dark'] {
        --fundo-ondas-bg: #06050b;
        --aurora-opacity: 0.6;
        --aurora-1-bg: radial-gradient(circle, #7c3aed 0%, #a855f7 40%, transparent 70%);
        --aurora-2-bg: radial-gradient(circle, #0284c7 0%, #38bdf8 40%, transparent 70%);
        --aurora-3-bg: radial-gradient(circle, #ec4899 0%, #8b5cf6 50%, transparent 70%);
        --aurora-4-bg: radial-gradient(circle, #06b6d4 0%, #7c3aed 50%, transparent 70%);
        --cursor-glow-bg: radial-gradient(circle, rgba(168, 85, 247, 0.22) 0%, rgba(56, 189, 248, 0.12) 35%, transparent 70%);
        
        --stop-onda1-1: rgba(236, 72, 153, 0.35);
        --stop-onda1-2: rgba(139, 92, 246, 0.25);
        --stop-onda1-3: rgba(59, 130, 246, 0.15);
        
        --stop-onda2-1: rgba(168, 85, 247, 0.30);
        --stop-onda2-2: rgba(6, 182, 212, 0.20);
        --stop-onda2-3: rgba(124, 58, 237, 0.10);
        
        --stop-onda3-1: rgba(56, 189, 248, 0.25);
        --stop-onda3-2: rgba(192, 132, 252, 0.20);
        --stop-onda3-3: rgba(2, 132, 199, 0.05);
      }

      #fundo-ondas-container {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: -999;
        overflow: hidden;
        background: var(--fundo-ondas-bg);
        transition: background var(--transition-base, 250ms ease);
      }

      .stop-onda1-1 { stop-color: var(--stop-onda1-1); }
      .stop-onda1-2 { stop-color: var(--stop-onda1-2); }
      .stop-onda1-3 { stop-color: var(--stop-onda1-3); }

      .stop-onda2-1 { stop-color: var(--stop-onda2-1); }
      .stop-onda2-2 { stop-color: var(--stop-onda2-2); }
      .stop-onda2-3 { stop-color: var(--stop-onda2-3); }

      .stop-onda3-1 { stop-color: var(--stop-onda3-1); }
      .stop-onda3-2 { stop-color: var(--stop-onda3-2); }
      .stop-onda3-3 { stop-color: var(--stop-onda3-3); }

      .aurora-orb {
        position: absolute;
        border-radius: 50%;
        filter: blur(80px);
        opacity: var(--aurora-opacity);
        will-change: transform;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }
      .aurora-1 {
        width: 650px;
        height: 650px;
        top: -15%;
        right: -10%;
        background: var(--aurora-1-bg);
        animation: orbMove1 18s ease-in-out infinite alternate;
      }
      .aurora-2 {
        width: 550px;
        height: 550px;
        bottom: -15%;
        left: -10%;
        background: var(--aurora-2-bg);
        animation: orbMove2 22s ease-in-out infinite alternate;
      }
      .aurora-3 {
        width: 500px;
        height: 500px;
        top: 35%;
        left: 45%;
        background: var(--aurora-3-bg);
        animation: orbMove3 20s ease-in-out infinite alternate;
      }
      .aurora-4 {
        width: 420px;
        height: 420px;
        top: 60%;
        right: 15%;
        background: var(--aurora-4-bg);
        animation: orbMove1 16s ease-in-out infinite alternate-reverse;
      }

      .ondas-diagonais-wrap {
        position: absolute;
        inset: -40%;
        width: 180%;
        height: 180%;
        transform: rotate(-25deg);
        transform-origin: center;
        will-change: transform;
      }

      .onda-svg {
        position: absolute;
        width: 100%;
        height: 100%;
        will-change: transform;
      }
      .onda-svg-1 {
        top: 5%;
        animation: ondaFlutua1 14s ease-in-out infinite alternate;
      }
      .onda-svg-2 {
        top: 25%;
        animation: ondaFlutua2 18s ease-in-out infinite alternate;
      }
      .onda-svg-3 {
        top: 45%;
        animation: ondaFlutua3 16s ease-in-out infinite alternate;
      }

      .cursor-glow {
        position: absolute;
        width: 600px;
        height: 600px;
        border-radius: 50%;
        background: var(--cursor-glow-bg);
        transform: translate3d(-50%, -50%, 0);
        pointer-events: none;
        will-change: transform;
        filter: blur(30px);
      }

      @keyframes orbMove1 {
        0% { transform: translate3d(0, 0, 0) scale(1); }
        50% { transform: translate3d(-80px, 60px, 0) scale(1.15); }
        100% { transform: translate3d(40px, -70px, 0) scale(0.95); }
      }
      @keyframes orbMove2 {
        0% { transform: translate3d(0, 0, 0) scale(1); }
        50% { transform: translate3d(90px, -60px, 0) scale(1.2); }
        100% { transform: translate3d(-50px, 80px, 0) scale(0.9); }
      }
      @keyframes orbMove3 {
        0% { transform: translate3d(0, 0, 0) scale(0.9); }
        50% { transform: translate3d(-70px, -50px, 0) scale(1.25); }
        100% { transform: translate3d(60px, 40px, 0) scale(1); }
      }
      @keyframes ondaFlutua1 {
        0% { transform: translateY(0) translateX(0); }
        100% { transform: translateY(-40px) translateX(-30px); }
      }
      @keyframes ondaFlutua2 {
        0% { transform: translateY(0) translateX(0); }
        100% { transform: translateY(35px) translateX(25px); }
      }
      @keyframes ondaFlutua3 {
        0% { transform: translateY(0) translateX(0); }
        100% { transform: translateY(-30px) translateX(20px); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(container);

  const luzCursor = document.getElementById('luz-cursor-glow');
  const ondasWrap = document.getElementById('ondas-diagonais');

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let curX = mouseX;
  let curY = mouseY;
  let ticking = false;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!ticking) {
      requestAnimationFrame(atualizarCursor);
      ticking = true;
    }
  }, { passive: true });

  function atualizarCursor() {
    curX += (mouseX - curX) * 0.08;
    curY += (mouseY - curY) * 0.08;

    if (luzCursor) {
      luzCursor.style.transform = `translate3d(${curX - 300}px, ${curY - 300}px, 0)`;
    }

    if (ondasWrap) {
      const offsetX = (curX - window.innerWidth / 2) * 0.025;
      const offsetY = (curY - window.innerHeight / 2) * 0.025;
      ondasWrap.style.transform = `rotate(-25deg) translate3d(${offsetX}px, ${offsetY}px, 0)`;
    }

    if (Math.abs(mouseX - curX) > 0.5 || Math.abs(mouseY - curY) > 0.5) {
      requestAnimationFrame(atualizarCursor);
    } else {
      ticking = false;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarFundoOndas);
} else {
  iniciarFundoOndas();
}

export { iniciarFundoOndas };
