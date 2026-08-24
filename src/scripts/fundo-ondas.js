/**
 * Fundo de Ondas e Luzes Cósmicas — Alta Performance (Ultra Leve & 60 FPS)
 * Cria um ambiente dinâmico, moderno e suave sem sobrecarregar GPU/CPU.
 * Totalmente adaptado para os Modos Claro e Escuro.
 */

function iniciarFundoOndas() {
  if (document.getElementById('fundo-ondas-container')) return;

  const container = document.createElement('div');
  container.id = 'fundo-ondas-container';

  container.innerHTML = `
    <!-- Auroras Vivas com Gradientes Suaves Nativos (Sem filtro pesado) -->
    <div class="aurora-orb aurora-1"></div>
    <div class="aurora-orb aurora-2"></div>
    <div class="aurora-orb aurora-3"></div>
    <div class="aurora-orb aurora-4"></div>

    <!-- Ondas Fluidas em Perspectiva Diagonal -->
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

    <!-- Ponto de Iluminação Sutil sob o Cursor -->
    <div id="luz-cursor-glow" class="cursor-glow"></div>
  `;

  if (!document.getElementById('estilo-fundo-ondas-moderno')) {
    const style = document.createElement('style');
    style.id = 'estilo-fundo-ondas-moderno';
    style.textContent = `
      :root {
        --fundo-ondas-bg: #f6f8fc;
        --aurora-1-bg: radial-gradient(circle, rgba(124, 58, 237, 0.14) 0%, rgba(168, 85, 247, 0.06) 45%, transparent 70%);
        --aurora-2-bg: radial-gradient(circle, rgba(2, 132, 199, 0.14) 0%, rgba(56, 189, 248, 0.06) 45%, transparent 70%);
        --aurora-3-bg: radial-gradient(circle, rgba(236, 72, 153, 0.11) 0%, rgba(139, 92, 246, 0.05) 50%, transparent 70%);
        --aurora-4-bg: radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, rgba(124, 58, 237, 0.05) 50%, transparent 70%);
        --cursor-glow-bg: radial-gradient(circle, rgba(124, 58, 237, 0.06) 0%, rgba(56, 189, 248, 0.03) 40%, transparent 70%);
        
        --stop-onda1-1: rgba(236, 72, 153, 0.10);
        --stop-onda1-2: rgba(139, 92, 246, 0.08);
        --stop-onda1-3: rgba(59, 130, 246, 0.04);
        
        --stop-onda2-1: rgba(168, 85, 247, 0.09);
        --stop-onda2-2: rgba(6, 182, 212, 0.06);
        --stop-onda2-3: rgba(124, 58, 237, 0.03);
        
        --stop-onda3-1: rgba(56, 189, 248, 0.10);
        --stop-onda3-2: rgba(192, 132, 252, 0.06);
        --stop-onda3-3: rgba(2, 132, 199, 0.02);
      }

      [data-theme='dark'] {
        --fundo-ondas-bg: #06050b;
        --aurora-1-bg: radial-gradient(circle, rgba(124, 58, 237, 0.45) 0%, rgba(168, 85, 247, 0.2) 45%, transparent 70%);
        --aurora-2-bg: radial-gradient(circle, rgba(2, 132, 199, 0.45) 0%, rgba(56, 189, 248, 0.2) 45%, transparent 70%);
        --aurora-3-bg: radial-gradient(circle, rgba(236, 72, 153, 0.4) 0%, rgba(139, 92, 246, 0.2) 50%, transparent 70%);
        --aurora-4-bg: radial-gradient(circle, rgba(6, 182, 212, 0.35) 0%, rgba(124, 58, 237, 0.18) 50%, transparent 70%);
        --cursor-glow-bg: radial-gradient(circle, rgba(168, 85, 247, 0.16) 0%, rgba(56, 189, 248, 0.08) 40%, transparent 70%);
        
        --stop-onda1-1: rgba(236, 72, 153, 0.30);
        --stop-onda1-2: rgba(139, 92, 246, 0.20);
        --stop-onda1-3: rgba(59, 130, 246, 0.10);
        
        --stop-onda2-1: rgba(168, 85, 247, 0.25);
        --stop-onda2-2: rgba(6, 182, 212, 0.16);
        --stop-onda2-3: rgba(124, 58, 237, 0.08);
        
        --stop-onda3-1: rgba(56, 189, 248, 0.20);
        --stop-onda3-2: rgba(192, 132, 252, 0.16);
        --stop-onda3-3: rgba(2, 132, 199, 0.04);
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
        contain: strict;
        transform: translateZ(0);
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
        will-change: transform;
        pointer-events: none;
        transform: translateZ(0);
      }
      .aurora-1 {
        width: 600px;
        height: 600px;
        top: -10%;
        right: -5%;
        background: var(--aurora-1-bg);
        animation: orbMove1 24s ease-in-out infinite alternate;
      }
      .aurora-2 {
        width: 500px;
        height: 500px;
        bottom: -10%;
        left: -5%;
        background: var(--aurora-2-bg);
        animation: orbMove2 28s ease-in-out infinite alternate;
      }
      .aurora-3 {
        width: 450px;
        height: 450px;
        top: 35%;
        left: 45%;
        background: var(--aurora-3-bg);
        animation: orbMove3 26s ease-in-out infinite alternate;
      }
      .aurora-4 {
        width: 380px;
        height: 380px;
        top: 60%;
        right: 15%;
        background: var(--aurora-4-bg);
        animation: orbMove1 22s ease-in-out infinite alternate-reverse;
      }

      .ondas-diagonais-wrap {
        position: absolute;
        inset: -30%;
        width: 160%;
        height: 160%;
        transform: rotate(-22deg);
        transform-origin: center;
        pointer-events: none;
        contain: strict;
      }

      .onda-svg {
        position: absolute;
        width: 100%;
        height: 100%;
        will-change: transform;
        transform: translateZ(0);
      }
      .onda-svg-1 {
        top: 5%;
        animation: ondaFlutua1 18s ease-in-out infinite alternate;
      }
      .onda-svg-2 {
        top: 25%;
        animation: ondaFlutua2 22s ease-in-out infinite alternate;
      }
      .onda-svg-3 {
        top: 45%;
        animation: ondaFlutua3 20s ease-in-out infinite alternate;
      }

      .cursor-glow {
        position: absolute;
        width: 400px;
        height: 400px;
        border-radius: 50%;
        background: var(--cursor-glow-bg);
        transform: translate3d(-50%, -50%, 0);
        pointer-events: none;
        will-change: transform;
      }

      @keyframes orbMove1 {
        0% { transform: translate3d(0, 0, 0) scale(1); }
        50% { transform: translate3d(-50px, 40px, 0) scale(1.08); }
        100% { transform: translate3d(30px, -40px, 0) scale(0.96); }
      }
      @keyframes orbMove2 {
        0% { transform: translate3d(0, 0, 0) scale(1); }
        50% { transform: translate3d(50px, -40px, 0) scale(1.1); }
        100% { transform: translate3d(-30px, 50px, 0) scale(0.94); }
      }
      @keyframes orbMove3 {
        0% { transform: translate3d(0, 0, 0) scale(0.96); }
        50% { transform: translate3d(-40px, -30px, 0) scale(1.12); }
        100% { transform: translate3d(40px, 30px, 0) scale(1); }
      }
      @keyframes ondaFlutua1 {
        0% { transform: translateY(0) translateX(0); }
        100% { transform: translateY(-25px) translateX(-20px); }
      }
      @keyframes ondaFlutua2 {
        0% { transform: translateY(0) translateX(0); }
        100% { transform: translateY(25px) translateX(18px); }
      }
      @keyframes ondaFlutua3 {
        0% { transform: translateY(0) translateX(0); }
        100% { transform: translateY(-20px) translateX(15px); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(container);

  const luzCursor = document.getElementById('luz-cursor-glow');
  if (!luzCursor) return;

  let mouseX = -9999;
  let mouseY = -9999;
  let ticking = false;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!ticking) {
      requestAnimationFrame(() => {
        luzCursor.style.transform = `translate3d(${mouseX - 200}px, ${mouseY - 200}px, 0)`;
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarFundoOndas);
} else {
  iniciarFundoOndas();
}

export { iniciarFundoOndas };
