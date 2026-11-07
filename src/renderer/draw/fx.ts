export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  kind: 'heart' | 'spark' | 'paw'
}

export function spawnBurst(particles: Particle[], x: number, y: number, kind: Particle['kind']): void {
  const count = kind === 'paw' ? 3 : 6
  for (let i = 0; i < count; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 30,
      vy: -20 - Math.random() * 30,
      life: 0.8 + Math.random() * 0.4,
      max: 1,
      kind,
    })
  }
}

export function updateParticles(particles: Particle[], dt: number): void {
  for (const particle of particles) {
    particle.life -= dt
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    particle.vy += 20 * dt
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) particles.splice(i, 1)
  }
  if (particles.length > 40) particles.splice(0, particles.length - 40)
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const particle of particles) {
    const alpha = Math.max(0, particle.life)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(particle.x, particle.y)
    if (particle.kind === 'heart') {
      ctx.fillStyle = '#e36b7a'
      ctx.beginPath()
      ctx.moveTo(0, 3)
      ctx.bezierCurveTo(-8, -4, -2, -8, 0, -4)
      ctx.bezierCurveTo(2, -8, 8, -4, 0, 3)
      ctx.fill()
    } else if (particle.kind === 'spark') {
      ctx.fillStyle = '#f2c14e'
      ctx.rotate(particle.life * 4)
      ctx.fillRect(-2, -6, 4, 12)
      ctx.fillRect(-6, -2, 12, 4)
    } else {
      ctx.fillStyle = 'rgba(120, 78, 40, 0.45)'
      ctx.beginPath()
      ctx.ellipse(0, 0, 5, 4, 0.4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}
