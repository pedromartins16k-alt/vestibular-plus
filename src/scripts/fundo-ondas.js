/**
 * Fundo de Ondas Suaves e Interativas (Calm Waves)
 * Efeito visual moderno, fluído e leve que reage suavemente ao movimento do mouse.
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
    opacity: 0.75;
    transition: opacity 0.5s ease;
  `;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let width, height;
  let animationFrameId;

  // Posição do mouse com amortecimento suave (lerp)
  let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let targetMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  function redimensionar() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', redimensionar);
  redimensionar();

  window.addEventListener('mousemove', (e) => {
    targetMouse.x = e.clientX;
    targetMouse.y = e.clientY;
  });

  let tempo = 0;

  // Definição das camadas de ondas calmantes nas cores da identidade visual
  const camadas = [
    {
      comprimentoOnda: 0.0018,
      velocidade: 0.006,
      amplitude: 55,
      yOffset: 0.65,
      cor1: 'rgba(124, 58, 237, 0.28)', // Roxo vibrante
      cor2: 'rgba(59, 130, 246, 0.15)',  // Azul
    },
    {
      comprimentoOnda: 0.0024,
      velocidade: 0.008,
      amplitude: 70,
      yOffset: 0.75,
      cor1: 'rgba(236, 72, 153, 0.22)', // Rosa Neon / Aurora
      cor2: 'rgba(124, 58, 237, 0.12)', // Violeta
    },
    {
      comprimentoOnda: 0.0014,
      velocidade: 0.005,
      amplitude: 45,
      yOffset: 0.85,
      cor1: 'rgba(6, 182, 212, 0.20)',  // Ciano / Azul claro
      cor2: 'rgba(147, 51, 234, 0.10)', // Púrpura
    }
  ];

  function desenharOnda(camada, index) {
    ctx.save();

    const mouseInfluenciaX = (mouse.x - width / 2) * 0.0003 * (index + 1);
    const mouseInfluenciaY = (mouse.y - height / 2) * 0.08 * (index + 1);

    const gradiente = ctx.createLinearGradient(0, 0, width, height);
    gradiente.addColorStop(0, camada.cor1);
    gradiente.addColorStop(1, camada.cor2);

    ctx.fillStyle = gradiente;
    ctx.beginPath();

    const baseY = height * camada.yOffset + mouseInfluenciaY;
    ctx.moveTo(0, height);
    ctx.lineTo(0, baseY);

    for (let x = 0; x <= width; x += 12) {
      const seno1 = Math.sin(x * camada.comprimentoOnda + tempo * camada.velocidade + mouseInfluenciaX);
      const seno2 = Math.cos(x * camada.comprimentoOnda * 0.5 - tempo * camada.velocidade * 0.8);
      
      // Deformação suave ao redor do cursor
      const distMouse = Math.hypot(x - mouse.x, baseY - mouse.y);
      const ondaMouse = Math.exp(-distMouse / 260) * 35 * Math.sin(distMouse * 0.03 - tempo * 0.05);

      const y = baseY + (seno1 + seno2) * (camada.amplitude * 0.5) + ondaMouse;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function desenharGlowCursor() {
    ctx.save();
    // Brilho suave sob o cursor
    const radial = ctx.createRadialGradient(mouse.x, mouse.y, 10, mouse.x, mouse.y, 320);
    radial.addColorStop(0, 'rgba(168, 85, 247, 0.18)');
    radial.addColorStop(0.5, 'rgba(59, 130, 246, 0.08)');
    radial.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function animar() {
    // Interpolação suave do mouse (easing)
    mouse.x += (targetMouse.x - mouse.x) * 0.04;
    mouse.y += (targetMouse.y - mouse.y) * 0.04;

    ctx.clearRect(0, 0, width, height);

    // Efeito de iluminação que acompanha o mouse
    desenharGlowCursor();

    // Renderiza cada camada de onda fluída
    for (let i = 0; i < camadas.length; i++) {
      desenharOnda(camadas[i], i);
    }

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
