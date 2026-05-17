/* =====================================================================
   Maleen Kidiwela — site behavior
   ===================================================================== */

// ───── Hero (Prisma): nav-on-dark + subtle bg parallax ─────────────────
(() => {
  const hero = document.querySelector('.hero-prisma');
  const nav  = document.querySelector('.nav');
  if (!hero) return;

  // toggle nav-over-dark while the hero is in view
  if (nav && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      ([entry]) => nav.classList.toggle('over-dark', entry.isIntersecting && entry.intersectionRatio > 0.35),
      { threshold: [0, 0.35, 0.75, 1] }
    );
    io.observe(hero);
  }

  // subtle mouse parallax on bg and any [data-parallax] el inside the hero
  const targets = hero.querySelectorAll('[data-parallax]');
  if (targets.length) {
    let rect = hero.getBoundingClientRect();
    const sync = () => { rect = hero.getBoundingClientRect(); };
    window.addEventListener('resize', sync, { passive: true });

    hero.addEventListener('mousemove', (e) => {
      const cx = (e.clientX - rect.left) / rect.width - 0.5;
      const cy = (e.clientY - rect.top)  / rect.height - 0.5;
      targets.forEach((el) => {
        const k = parseFloat(el.dataset.parallax || '0');
        el.style.transform = `translate3d(${cx * k}px, ${cy * k}px, 0)`;
      });
    }, { passive: true });
    hero.addEventListener('mouseleave', () => {
      targets.forEach((el) => { el.style.transform = 'translate3d(0,0,0)'; });
    });
  }
})();


// ───── (deprecated) old canvas hero — kept inert if elements absent ────
(() => {
  const canvas = document.getElementById('heroCanvas');
  const hero   = document.querySelector('.hero');
  if (!canvas || !hero) return;

  const ctx = canvas.getContext('2d', { alpha: false });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0;
  let stations = [];
  const waves = [];                                // { x, y, t, maxR, speed, strong }
  const mouse = { x: null, y: null, r: 220 };
  let lastTrail = 0;

  // —— look ——
  const BG          = '#050608';
  const STN_RGB     = '72,202,228';        // ocean teal
  const STN_HOT_RGB = '250,248,243';       // paper / near-white
  const RING_RGB    = '72,202,228';

  class Station {
    constructor(x, y, dx, dy, size) {
      this.x = x; this.y = y;
      this.dx = dx; this.dy = dy;
      this.size = size;
      this.basePhase = Math.random() * Math.PI * 2;
      this.energy = 0;                    // boost from wave passes
    }
    draw(now) {
      const pulse = 1 + 0.18 * Math.sin(now * 0.0015 + this.basePhase) + this.energy * 1.4;
      const a = 0.55 + Math.min(this.energy, 1) * 0.45;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * pulse, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${STN_RGB},${a})`;
      ctx.fill();
      if (this.energy > 0.25) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * pulse + 4 * this.energy, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${STN_RGB},${Math.min(this.energy, 0.7)})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }
    update(now) {
      // boundary bounce
      if (this.x > W || this.x < 0) this.dx = -this.dx;
      if (this.y > H || this.y < 0) this.dy = -this.dy;

      // mouse repulsion (the Aether Flow behaviour)
      if (mouse.x !== null) {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const d  = Math.hypot(dx, dy) || 0.001;
        if (d < mouse.r + this.size) {
          const fx = dx / d, fy = dy / d;
          const force = (mouse.r - d) / mouse.r;
          this.x -= fx * force * 4.5;
          this.y -= fy * force * 4.5;
        }
      }

      // wavefront energy bump
      for (const w of waves) {
        const age = (now - w.t) / 1000;
        const r = age * w.speed;
        const d = Math.hypot(this.x - w.x, this.y - w.y);
        const band = Math.abs(d - r);
        if (band < 28) {
          const inten = (1 - band / 28) * (1 - r / w.maxR);
          this.energy = Math.min(1.4, this.energy + inten * (w.strong ? 0.10 : 0.04));
        }
      }
      this.energy *= 0.93;

      this.x += this.dx;
      this.y += this.dy;
      this.draw(now);
    }
  }

  function buildStations() {
    stations = [];
    const n = Math.min(220, Math.max(60, Math.round((W * H) / 11000)));
    for (let i = 0; i < n; i++) {
      const size = Math.random() * 2 + 1;
      const x = Math.random() * (W - size * 4) + size * 2;
      const y = Math.random() * (H - size * 4) + size * 2;
      const dx = (Math.random() - 0.5) * 0.36;
      const dy = (Math.random() - 0.5) * 0.36;
      stations.push(new Station(x, y, dx, dy, size));
    }
  }

  function connect() {
    const maxD2 = (W / 7) * (H / 7);     // matches Aether Flow threshold
    const fadeNorm = 24000;
    for (let a = 0; a < stations.length; a++) {
      const sa = stations[a];
      for (let b = a + 1; b < stations.length; b++) {
        const sb = stations[b];
        const dx = sa.x - sb.x;
        const dy = sa.y - sb.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < maxD2) {
          let opacity = 1 - d2 / fadeNorm;
          if (opacity <= 0) continue;

          // brighten near-mouse links (Aether Flow signature behaviour)
          let nearMouse = false;
          if (mouse.x !== null) {
            const mdx = sa.x - mouse.x, mdy = sa.y - mouse.y;
            if ((mdx * mdx + mdy * mdy) < mouse.r * mouse.r) nearMouse = true;
          }

          if (nearMouse) {
            ctx.strokeStyle = `rgba(${STN_HOT_RGB},${opacity})`;
            ctx.lineWidth = 0.85;
          } else {
            ctx.strokeStyle = `rgba(${STN_RGB},${opacity * 0.42})`;
            ctx.lineWidth = 0.55;
          }
          ctx.beginPath();
          ctx.moveTo(sa.x, sa.y);
          ctx.lineTo(sb.x, sb.y);
          ctx.stroke();
        }
      }
    }
  }

  // —— pointer ——
  function localXY(e) {
    const rect = hero.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  function onMove(e) {
    const { x, y } = localXY(e);
    if (x < 0 || x > W || y < 0 || y > H) return;
    mouse.x = x; mouse.y = y;
    const now = performance.now();
    if (now - lastTrail > 260) {
      waves.push({ x, y, t: now, maxR: 620, speed: 300, strong: true });
      lastTrail = now;
    }
    parallax(x, y);
  }
  function onLeave() {
    mouse.x = mouse.y = null;
    parallaxReset();
  }
  function onClick(e) {
    const { x, y } = localXY(e);
    waves.push({ x, y, t: performance.now(), maxR: 820, speed: 360, strong: true });
  }

  hero.addEventListener('mousemove',  onMove,  { passive: true });
  hero.addEventListener('mouseleave', onLeave, { passive: true });
  hero.addEventListener('click',      onClick);
  hero.addEventListener('touchstart', (e) => { onMove(e); onClick(e); }, { passive: true });

  // —— parallax overlay ——
  const parallaxEls = hero.querySelectorAll('[data-parallax]');
  function parallax(x, y) {
    const cx = (x / W - 0.5);
    const cy = (y / H - 0.5);
    parallaxEls.forEach((el) => {
      const k = parseFloat(el.dataset.parallax || '0');
      el.style.transform = `translate3d(${-cx * k}px, ${-cy * k}px, 0)`;
    });
  }
  function parallaxReset() {
    parallaxEls.forEach((el) => { el.style.transform = 'translate3d(0,0,0)'; });
  }

  // —— draw loop ——
  let raf = 0;
  function animate(now) {
    raf = requestAnimationFrame(animate);
    // solid bg per frame for clean trails (no smearing)
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // wave rings (drawn behind connections)
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      const age = (now - w.t) / 1000;
      const r = age * w.speed;
      if (r > w.maxR) { waves.splice(i, 1); continue; }
      const fade = 1 - r / w.maxR;
      ctx.strokeStyle = `rgba(${RING_RGB},${fade * (w.strong ? 0.35 : 0.14)})`;
      ctx.lineWidth = w.strong ? 1.2 : 0.7;
      ctx.beginPath();
      ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // connections then stations on top
    connect();
    for (const s of stations) s.update(now);

    // cursor halo
    if (mouse.x !== null) {
      const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, mouse.r);
      g.addColorStop(0, `rgba(${RING_RGB},0.10)`);
      g.addColorStop(1, `rgba(${RING_RGB},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStations();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(hero);
  resize();
  if (!reduceMotion) raf = requestAnimationFrame(animate);
  else { ctx.fillStyle = BG; ctx.fillRect(0,0,W,H); connect(); for (const s of stations) s.draw(0); }

  // signature wave on first paint
  setTimeout(() => {
    waves.push({ x: W * 0.5, y: H * 0.55, t: performance.now(), maxR: 900, speed: 320, strong: true });
  }, 800);
})();


// ───── Hero: live seismogram scope (3-channel) ─────────────────────────
(() => {
  const canvas = document.getElementById('scopeCanvas');
  const clock  = document.getElementById('scopeClock');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // colours
  const TRACE   = ['#48caE4', '#7fb6c3', '#c85a3c']; // 3 channels — teal, soft, coral
  const GRID    = 'rgba(255,255,255,0.05)';
  const BASELINE= 'rgba(255,255,255,0.10)';

  // synthetic seismogram state — circular buffers per channel
  const CHANNELS = 3;
  const BUFLEN = 800;
  const buffers = Array.from({ length: CHANNELS }, () => new Float32Array(BUFLEN));
  let head = 0; // write index

  // per-channel noise generators
  const gens = Array.from({ length: CHANNELS }, (_, i) => ({
    seed: Math.random() * 1000,
    freq: 0.6 + i * 0.25,
    burst: 0,       // current burst amplitude (decays)
    nextBurst: 1200 + Math.random() * 2400,
    elapsed: 0,
  }));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  // 1D smooth noise via interpolated random points
  function smoothNoise(t, seed) {
    const x = t * 0.0019 + seed;
    const xi = Math.floor(x);
    const xf = x - xi;
    const a = pseudoRand(xi);
    const b = pseudoRand(xi + 1);
    const u = xf * xf * (3 - 2 * xf);
    return a * (1 - u) + b * u;
  }
  function pseudoRand(n) {
    const s = Math.sin(n * 12.9898) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  }

  let lastT = performance.now();
  function step(now) {
    const dt = Math.min(now - lastT, 80);
    lastT = now;

    // advance simulation: ~120 samples/sec equivalent
    const samples = Math.max(1, Math.round(dt * 0.18));
    for (let s = 0; s < samples; s++) {
      for (let c = 0; c < CHANNELS; c++) {
        const g = gens[c];
        g.elapsed += 9;
        // base ambient noise (microseism band)
        const base =
          smoothNoise(g.elapsed * g.freq,        g.seed)       * 0.18 +
          smoothNoise(g.elapsed * g.freq * 2.3,  g.seed + 13)  * 0.10 +
          smoothNoise(g.elapsed * g.freq * 5.1,  g.seed + 71)  * 0.05;

        // scheduled burst (mimics small event onset)
        if (g.elapsed > g.nextBurst) {
          g.burst = 0.85;
          g.nextBurst = g.elapsed + 1400 + Math.random() * 2600;
        }
        g.burst *= 0.985;
        const burst = g.burst > 0.01
          ? Math.sin(g.elapsed * 0.13 + g.seed) * g.burst
          : 0;

        buffers[c][head] = base + burst;
      }
      head = (head + 1) % BUFLEN;
    }

    render();
    requestAnimationFrame(step);
  }

  function render() {
    const W = canvas.width  / dpr;
    const H = canvas.height / dpr;
    ctx.clearRect(0, 0, W, H);

    // grid (vertical time ticks)
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const x = (W / 5) * i;
      ctx.beginPath();
      ctx.moveTo(x, 6); ctx.lineTo(x, H - 6);
      ctx.stroke();
    }

    // 3 traces
    const rowH = H / CHANNELS;
    for (let c = 0; c < CHANNELS; c++) {
      const yMid = rowH * c + rowH / 2;

      // baseline
      ctx.strokeStyle = BASELINE;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, yMid); ctx.lineTo(W, yMid);
      ctx.stroke();

      // trace
      ctx.strokeStyle = TRACE[c];
      ctx.lineWidth = 1.1;
      ctx.shadowColor = TRACE[c];
      ctx.shadowBlur = 4;
      ctx.beginPath();
      const amp = rowH * 0.35;
      // unroll circular buffer
      for (let i = 0; i < BUFLEN; i++) {
        const idx = (head + i) % BUFLEN;
        const v = buffers[c][idx];
        const x = (i / (BUFLEN - 1)) * W;
        const y = yMid - v * amp;
        if (i === 0) ctx.moveTo(x, y);
        else         ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // now-line at right edge
    ctx.strokeStyle = 'rgba(108, 210, 142, 0.55)';
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W - 1, 4); ctx.lineTo(W - 1, H - 4);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function fmtClock() {
    if (!clock) return;
    const d = new Date();
    const hh = String(d.getUTCHours()).padStart(2,'0');
    const mm = String(d.getUTCMinutes()).padStart(2,'0');
    const ss = String(d.getUTCSeconds()).padStart(2,'0');
    clock.textContent = `${hh}:${mm}:${ss} UTC`;
  }

  // init
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  // warm the buffers so the trace isn't flat on load
  for (let warm = 0; warm < BUFLEN; warm++) {
    for (let c = 0; c < CHANNELS; c++) {
      const g = gens[c];
      g.elapsed += 9;
      buffers[c][warm] = smoothNoise(g.elapsed * g.freq, g.seed) * 0.18;
    }
    head = (head + 1) % BUFLEN;
  }
  fmtClock();
  setInterval(fmtClock, 1000);
  if (!reduceMotion) requestAnimationFrame(step);
  else render();
})();


// ───── Reveal on scroll ─────────────────────────────────────────────────
const revealTargets = [
  '.hero-left > *',
  '.hero-right',
  '.about-portrait',
  '.about-text > *',
  '.head-row > *',
  '.zz',
  '.db-item',
  '.pub',
  '.viz-intro > *',
  '.viz-frame',
  '.quote > *',
  '.contact-left > *',
  '.contact-form',
];

revealTargets.forEach((sel, gi) => {
  document.querySelectorAll(sel).forEach((el, i) => {
    el.classList.add('reveal');
    const d = Math.min(i, 4);
    if (d > 0) el.classList.add(`reveal-d${d}`);
  });
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.08, rootMargin: '0px 0px -60px 0px' }
);
document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));


// ───── Nav: active section + scrolled state ─────────────────────────────
const nav = document.querySelector('.nav');
const navLinks = document.querySelectorAll('.nav-links a');
const sections = document.querySelectorAll('section[id]');

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach((link) => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  },
  { rootMargin: '-45% 0px -50% 0px' }
);
sections.forEach((s) => sectionObserver.observe(s));

let scrollTicking = false;
function onScroll() {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    nav.classList.toggle('scrolled', window.scrollY > 24);
    scrollTicking = false;
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();


// ───── Mobile menu ──────────────────────────────────────────────────────
const navToggle = document.querySelector('.nav-toggle');
const navLinksList = document.querySelector('.nav-links');

if (navToggle && navLinksList) {
  navToggle.addEventListener('click', () => {
    const open = navToggle.classList.toggle('open');
    navLinksList.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', String(open));
  });
  navLinksList.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navToggle.classList.remove('open');
      navLinksList.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}


// ───── Contact form (demo handler) ──────────────────────────────────────
const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = contactForm.querySelector('.btn-submit');
    const label = btn.querySelector('span');
    const original = label.textContent;

    label.textContent = 'Sending…';
    btn.disabled = true;
    btn.style.opacity = '0.7';

    setTimeout(() => {
      label.textContent = 'Message sent';
      btn.style.opacity = '1';
      contactForm.reset();
      setTimeout(() => {
        label.textContent = original;
        btn.disabled = false;
      }, 2800);
    }, 900);
  });
}


// ───── 3D viz: direct load, fade in on iframe ready ────────────────────
(() => {
  const vizFrame  = document.getElementById('vizFrame');
  const vizIframe = document.getElementById('vizIframe');
  if (!vizFrame || !vizIframe) return;

  vizIframe.addEventListener('load', () => {
    // small grace so Plotly has a frame to mount before we cross-fade
    setTimeout(() => vizFrame.classList.add('iframe-loaded'), 250);
  });

  // safety: if the load event never fires within 12s (slow network),
  // still reveal the iframe so the user isn't stuck on the spinner
  setTimeout(() => vizFrame.classList.add('iframe-loaded'), 12000);
})();
