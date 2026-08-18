/**
 * Fundo de Ondas Oceânicas — GPU Acellerated (Zero Lag / Ultra Leve)
 * Utiliza gradientes e transforms via aceleração por hardware da GPU,
 * garantindo 60fps cravados sem travar a CPU ou o navegador.
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
    background: #07060d;
  `;

  container.innerHTML = `
    <!-- Camada de Gradiente Base Diagonal -->
    <div id="onda-base" style="
      position: absolute;
      inset: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle at 80% 10%, rgba(124, 58, 237, 0.22) 0%, transparent 45%),
                  radial-gradient(circle at 20% 90%, rgba(59, 130, 246, 0.18) 0%, transparent 50%),
                  radial-gradient(circle at 60% 60%, rgba(236, 72, 153, 0.12) 0%, transparent 40%);
      transform: rotate(-25deg);
      animation: derivaOndas 22s ease-in-out infinite alternate;
      will-change: transform;
    "></div>

    <!-- Ondas Fluidas em Linhas Diagonais (Vista Aérea) -->
    <svg style="position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.45;" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gradMar" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#a855f7" stop-opacity="0.3"/>
          <stop offset="50%" stop-color="#38bdf8" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="#ec4899" stop-opacity="0.1"/>
        </linearGradient>
      </defs>
      <g id="ondas-grupo" style="transform: rotate(25deg); transform-origin: center; transition: transform 0.2s cubic-bezier(0.1, 0.9, 0.2, 1);">
        <path d="M-200,100 Q400,250 1200,80 T2600,150" fill="none" stroke="url(#gradMar)" stroke-width="45" stroke-linecap="round" />
        <path d="M-200,320 Q500,460 1300,280 T2600,360" fill="none" stroke="url(#gradMar)" stroke-width="60" stroke-linecap="round" />
        <path d="M-200,560 Q450,700 1250,520 T2600,600" fill="none" stroke="url(#gradMar)" stroke-width="50" stroke-linecap="round" />
        <path d="M-200,800 Q550,950 1350,760 T2600,850" fill="none" stroke="url(#gradMar)" stroke-width="65" stroke-linecap="round" />
        <path d="M-200,1040 Q480,1200 1280,1000 T2600,1100" fill="none" stroke="url(#gradMar)" stroke-width="55" stroke-linecap="round" />
      </g>
    </svg>

    <!-- Ponto de Luz Dinâmico que segue o Mouse com Aceleração GPU -->
    <div id="luz-cursor" style="
      position: absolute;
      width: 600px;
      height: 600px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(168, 85, 247, 0.18) 0%, rgba(56, 189, 248, 0.08) 40%, transparent 70%);
      transform: translate3d(-50%, -50%, 0);
      pointer-events: none;
      will-change: transform;
      opacity: 0.8;
    "></div>
  `;

  // Adiciona a animação CSS leve nas tags
  if (!document.getElementById('estilo-ondas-css')) {
    const style = document.createElement('style');
    style.id = 'estilo-ondas-css';
    style.textContent = `
      @keyframes derivaOndas {
        0% { transform: rotate(-25deg) translateY(-2%) translateX(2%); }
        100% { transform: rotate(-25deg) translateY(4%) translateX(-4%); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(container);

  const luzCursor = document.getElementById('luz-cursor');
  const ondasGrupo = document.getElementById('ondas-grupo');

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let curX = mouseX;
  let curY = mouseY;
  let ticking = false;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!ticking) {
      requestAnimationFrame(atualizarPosicao);
      ticking = true;
    }
  }, { passive: true });

  function atualizarPosicao() {
    curX += (mouseX - curX) * 0.08;
    curY += (mouseY - curY) * 0.08;

    if (luzCursor) {
      luzCursor.style.transform = `translate3d(${curX - 300}px, ${curY - 300}px, 0)`;
    }

    if (ondasGrupo) {
      const offsetX = (curX - window.innerWidth / 2) * 0.02;
      const offsetY = (curY - window.innerHeight / 2) * 0.02;
      ondasGrupo.style.transform = `rotate(25deg) translate3d(${offsetX}px, ${offsetY}px, 0)`;
    }

    if (Math.abs(mouseX - curX) > 0.5 || Math.abs(mouseY - curY) > 0.5) {
      requestAnimationFrame(atualizarPosicao);
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
