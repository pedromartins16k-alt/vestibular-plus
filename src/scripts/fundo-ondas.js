/**
 * Fundo de Ondas e Luzes Cósmicas — Ultra Moderno & Leve (GPU Accelerated)
 * Cria um ambiente dinâmico com ondas fluidas e auroras vibrantes que transparecem sob os cards de vidro.
 */

function iniciarFundoOndas() {
  if (document.getElementById('fundo-ondas-container')) return;

  const container = document.createElement('div');
  container.id = 'fundo-ondas-container';
  container.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: -999;
    overflow: hidden;
    background: #06050b;
  `;

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
            <stop offset="0%" stop-color="#ec4899" stop-opacity="0.35"/>
            <stop offset="50%" stop-color="#8b5cf6" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.15"/>
          </linearGradient>
        </defs>
      </svg>

      <svg class="onda-svg onda-svg-2" viewBox="0 0 1440 600" preserveAspectRatio="none">
        <path d="M0,280 C360,140 640,380 960,200 C1200,80 1360,280 1440,220 L1440,600 L0,600 Z" fill="url(#gradOnda2)"></path>
        <defs>
          <linearGradient id="gradOnda2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#a855f7" stop-opacity="0.3"/>
            <stop offset="50%" stop-color="#06b6d4" stop-opacity="0.2"/>
            <stop offset="100%" stop-color="#7c3aed" stop-opacity="0.1"/>
          </linearGradient>
        </defs>
      </svg>

      <svg class="onda-svg onda-svg-3" viewBox="0 0 1440 600" preserveAspectRatio="none">
        <path d="M0,100 C400,260 700,60 1000,200 C1250,320 1380,140 1440,180 L1440,600 L0,600 Z" fill="url(#gradOnda3)"></path>
        <defs>
          <linearGradient id="gradOnda3" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.25"/>
            <stop offset="60%" stop-color="#c084fc" stop-opacity="0.2"/>
            <stop offset="100%" stop-color="#0284c7" stop-opacity="0.05"/>
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
      .aurora-orb {
        position: absolute;
        border-radius: 50%;
        filter: blur(80px);
        opacity: 0.6;
        will-change: transform;
        pointer-events: none;
      }
      .aurora-1 {
        width: 650px;
        height: 650px;
        top: -15%;
        right: -10%;
        background: radial-gradient(circle, #7c3aed 0%, #a855f7 40%, transparent 70%);
        animation: orbMove1 18s ease-in-out infinite alternate;
      }
      .aurora-2 {
        width: 550px;
        height: 550px;
        bottom: -15%;
        left: -10%;
        background: radial-gradient(circle, #0284c7 0%, #38bdf8 40%, transparent 70%);
        animation: orbMove2 22s ease-in-out infinite alternate;
      }
      .aurora-3 {
        width: 500px;
        height: 500px;
        top: 35%;
        left: 45%;
        background: radial-gradient(circle, #ec4899 0%, #8b5cf6 50%, transparent 70%);
        animation: orbMove3 20s ease-in-out infinite alternate;
      }
      .aurora-4 {
        width: 420px;
        height: 420px;
        top: 60%;
        right: 15%;
        background: radial-gradient(circle, #06b6d4 0%, #7c3aed 50%, transparent 70%);
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
        background: radial-gradient(circle, rgba(168, 85, 247, 0.22) 0%, rgba(56, 189, 248, 0.12) 35%, transparent 70%);
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
