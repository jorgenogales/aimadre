export function initParticles(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let particles = [];
  const particleCount = 70;
  const mouse = { x: null, y: null, radius: 120 };

  // Ajustar tamaño del canvas
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Escuchar eventos del ratón
  window.addEventListener("mousemove", (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });

  window.addEventListener("mouseleave", () => {
    mouse.x = null;
    mouse.y = null;
  });

  // Clase Partícula
  class Particle {
    constructor() {
      this.reset(true);
    }

    reset(initial = false) {
      this.x = Math.random() * canvas.width;
      // Si es inicial, repartir por todo el canvas, si no, nacer abajo
      this.y = initial ? Math.random() * canvas.height : canvas.height + Math.random() * 20;
      this.size = Math.random() * 2.5 + 0.5;
      
      // Velocidad negativa para ir hacia arriba (Antigravedad)
      this.speedY = -(Math.random() * 0.8 + 0.2); 
      this.speedX = (Math.random() - 0.5) * 0.3; // Sutil deriva horizontal
      
      // Colores cian (HSL 184) o morado (HSL 270)
      const hue = Math.random() > 0.5 ? 184 : 270;
      const lightness = Math.random() > 0.5 ? 60 : 70;
      const alpha = Math.random() * 0.3 + 0.15;
      this.color = `hsla(${hue}, 100%, ${lightness}%, ${alpha})`;
      this.glowColor = `hsla(${hue}, 100%, ${lightness}%, 0.8)`;
      
      this.angle = Math.random() * Math.PI * 2;
      this.angleSpeed = Math.random() * 0.02 - 0.01;
    }

    update() {
      this.y += this.speedY;
      this.angle += this.angleSpeed;
      this.x += this.speedX + Math.sin(this.angle) * 0.15; // Sutil balanceo

      // Interacción con el ratón (Repulsión sutil)
      if (mouse.x !== null && mouse.y !== null) {
        const dx = this.x - mouse.x;
        const dy = this.y - mouse.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < mouse.radius) {
          const force = (mouse.radius - distance) / mouse.radius;
          const angle = Math.atan2(dy, dx);
          // Empujar la partícula sutilmente hacia afuera
          this.x += Math.cos(angle) * force * 1.5;
          this.y += Math.sin(angle) * force * 1.5;
        }
      }

      // Si la partícula sale por arriba, la reseteamos abajo
      if (this.y < -10) {
        this.reset(false);
      }
      
      // Rebote en bordes horizontales
      if (this.x < 0 || this.x > canvas.width) {
        this.speedX *= -1;
      }
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      
      // Sutil resplandor neon para las partículas más grandes
      if (this.size > 2) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.glowColor;
      } else {
        ctx.shadowBlur = 0;
      }
      
      ctx.fill();
    }
  }

  // Inicializar partículas
  function init() {
    particles = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }
  }
  init();

  // Bucle de animación
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
    }
    
    requestAnimationFrame(animate);
  }
  
  animate();
}
