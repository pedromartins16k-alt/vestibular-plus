/**
 * Fundo de Ondas Diagonais — Vista Aérea do Mar (Top-Down Ocean Waves)
 * Efeito visual de ondas oceânicas calmas descendo do topo direito em direção ao fundo esquerdo,
 * reagindo com ondulações dinâmicas ao movimento do mouse.
 */

function iniciarFundoOndas() {
  if (document.getElementById('fundo-ondas-canvas')) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'fundo-ondas-canvas';
  canvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: -999;
    opacity: 0.85;
    transition: opacity 0.5s ease;
  `;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let width, height, diagonalLength;
  let animationFrameId;

  // Interpolação suave do mouse (smooth lerp)
  let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let targetMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  function redimensionar() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    diagonalLength = Math.hypot(width, height);
  }

  window.addEventListener('resize', redimensionar);
  redimensionar();

  window.addEventListener('mousemove', (e) => {
    targetMouse.x = e.clientX;
    targetMouse.y = e.clientY;
  });

  let tempo = 0;

  // Configuração de ondas com fluxo diagonal do topo-direito (TR) para fundo-esquerdo (BL)
  const ondas = [
    { freq: 0.0035, vel: 0.012, amp: 28, cor: 'rgba(124, 58, 237, 0.16)', largura: 90 },
    { freq: 0.0045, vel: 0.016, amp: 38, cor: 'rgba(59, 130, 246, 0.14)', largura: 110 },
    { freq: 0.0028, vel: 0.010, amp: 48, cor: 'rgba(236, 72, 153, 0.12)', largura: 130 },
    { freq: 0.0055, vel: 0.019, amp: 22, cor: 'rgba(6, 182, 212, 0.15)', largura: 75 },
    { freq: 0.0038, vel: 0.014, amp: 32, cor: 'rgba(168, 85, 247, 0.15)', largura: 95 },
  ];

  function desenharFundoBase() {
    // Gradiente base suave e profundo
    const gradBase = ctx.createLinearGradient(width, 0, 0, height);
    gradBase.addColorStop(0, '#0f0c1b');
    gradBase.addColorStop(0.5, '#0b0914');
    gradBase.addColorStop(1, '#07060d');
    ctx.fillStyle = gradBase;
    ctx.fillRect(0, 0, width, height);
  }

  function desenharOndasVistaAerea() {
    ctx.save();

    // Rotação para criar a perspectiva diagonal exata (topo direito -> fundo esquerdo)
    // Ângulo de ~45 graus
    const angulo = Math.PI / 4;
    ctx.translate(width / 2, height / 2);
    ctx.rotate(angulo);

    const metadeDiag = diagonalLength * 0.85;
    const passoX = 16;
    const passoY = 38;

    for (let y = -metadeDiag; y <= metadeDiag; y += passoY) {
      for (let i = 0; i < ondas.length; i++) {
        const o = ondas[i];
        
        // Fase da onda se movendo em direção ao fundo-esquerdo (tempo positivo)
        const faseTempo = tempo * o.vel;
        const offsetOnda = (y + faseTempo * 120) % (metadeDiag * 2) - metadeDiag;

        ctx.beginPath();
        let primeiro = true;

        for (let x = -metadeDiag; x <= metadeDiag; x += passoX) {
          // Transformação de volta para coordenadas da tela para interação com mouse
          const cosA = Math.cos(-angulo);
          const sinA = Math.sin(-angulo);
          const screenX = x * cosA - offsetOnda * sinA + width / 2;
          const screenY = x * sinA + offsetOnda * cosA + height / 2;

          // Efeito de ondulação interativa ao passar o mouse
          const distMouse = Math.hypot(screenX - mouse.x, screenY - mouse.y);
          const deformacaoMouse = Math.exp(-distMouse / 280) * 45 * Math.sin(distMouse * 0.025 - tempo * 0.08);

          // Ondulações fluidas com ruído harmônico
          const sen1 = Math.sin(x * o.freq + faseTempo);
          const sen2 = Math.cos(x * o.freq * 0.5 - faseTempo * 0.6);
          const deslocamento = (sen1 + sen2) * o.amp + deformacaoMouse;

          const posY = offsetOnda + deslocamento;

          if (primeiro) {
            ctx.moveTo(x, posY);
            primeiro = false;
          } else {
            ctx.lineTo(x, posY);
          }
        }

        ctx.strokeStyle = o.cor;
        ctx.lineWidth = o.largura * 0.4;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Linha de crista fina e brilhante (espuma / reflexo de luz cósmico na água)
        ctx.strokeStyle = o.cor.replace(/[\d\.]+\)$/, '0.35)');
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function desenharLuzCursor() {
    ctx.save();
    // Reflexo de bioluminescência suave onde o mouse navega
    const rad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 380);
    rad.addColorStop(0, 'rgba(168, 85, 247, 0.16)');
    rad.addColorStop(0.35, 'rgba(56, 189, 248, 0.08)');
    rad.addColorStop(0.7, 'rgba(236, 72, 153, 0.04)');
    rad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function animar() {
    // Suavização do movimento do mouse
    mouse.x += (targetMouse.x - mouse.x) * 0.045;
    mouse.y += (targetMouse.y - mouse.y) * 0.045;

    desenharFundoBase();
    desenharOndasVistaAerea();
    desenharLuzCursor();

    tempo += 1;
    animationFrameId = requestAnimationFrame(animar);
  }

  animar();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarFundoOndas);
} else {
  iniciarFundoOndas();
}

export { iniciarFundoOndas };
