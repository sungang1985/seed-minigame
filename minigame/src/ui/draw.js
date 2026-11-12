const COLORS = {
  background: '#0b1523',
  panel: '#152437',
  border: '#25384b',
  primary: '#79e9c2',
  text: '#f1f7fb',
  muted: '#91a6bb',
  gold: '#ffdb88'
};

function roundedRect(ctx, x, y, width, height, radius = 16) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function panel(ctx, bounds, color = COLORS.panel, border = COLORS.border) {
  roundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, bounds.radius || 18);
  ctx.fillStyle = color;
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function text(ctx, value, x, y, size = 16, color = COLORS.text, align = 'left', weight = 'normal') {
  ctx.font = `${weight} ${size}px sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(String(value), x, y);
}

function button(ctx, bounds, label, secondary = false) {
  panel(ctx, bounds, secondary ? COLORS.panel : COLORS.primary, secondary ? COLORS.border : null);
  text(ctx, label, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, 17,
    secondary ? COLORS.text : COLORS.background, 'center', 'bold');
}

function inside(point, bounds) {
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y && point.y <= bounds.y + bounds.height;
}

function star(ctx, x, y, radius, color = COLORS.gold, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const length = index % 2 === 0 ? radius : radius * 0.46;
    const px = Math.cos(angle) * length;
    const py = Math.sin(angle) * length;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function background(ctx, width, height, elapsed = 0) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#101f32');
  gradient.addColorStop(1, COLORS.background);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  for (let index = 0; index < 42; index += 1) {
    const x = ((index * 97 + 31) % 353) / 353 * width;
    const y = ((index * 173 + 59) % 787) / 787 * height;
    const alpha = 0.13 + (Math.sin(elapsed * 0.8 + index) + 1) * 0.13;
    ctx.fillStyle = `rgba(184,213,240,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, index % 5 === 0 ? 1.6 : 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function orbit(ctx, x, y, radius, elapsed = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(121,233,194,0.13)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.69, 0, Math.PI * 2);
  ctx.stroke();
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, radius);
  glow.addColorStop(0, 'rgba(121,233,194,0.14)');
  glow.addColorStop(1, 'rgba(121,233,194,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  star(ctx, 0, Math.sin(elapsed * 1.6) * 5, radius * 0.4, COLORS.gold, -0.12);
  star(ctx, -radius * 0.78, -radius * 0.43, radius * 0.1, COLORS.primary, 0.3);
  star(ctx, radius * 0.78, radius * 0.48, radius * 0.13, COLORS.primary, -0.3);
  const angle = elapsed * 0.2 - 0.5;
  ctx.fillStyle = COLORS.primary;
  ctx.beginPath();
  ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

module.exports = { COLORS, roundedRect, panel, text, button, inside, star, background, orbit };
