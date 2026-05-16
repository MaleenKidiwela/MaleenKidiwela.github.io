/* =====================================================================
   Maleen Kidiwela — site behavior
   ===================================================================== */

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


// ───── 3D viz: prefetch + click-to-load ─────────────────────────────────
const vizFrame   = document.getElementById('vizFrame');
const vizPoster  = document.getElementById('vizPoster');
const vizLoader  = document.getElementById('vizLoader');
const vizLaunch  = document.getElementById('vizLaunch');
const vizLogEl   = document.getElementById('vlLog');

const PLOTLY_URL = 'https://cdn.plot.ly/plotly-3.3.1.min.js';
const VIZ_URL    = 'axial_3d.html';

let prefetched = false;
function prefetchViz() {
  if (prefetched) return;
  prefetched = true;

  // Prefetch the iframe document (large) — uses idle bandwidth, cached by browser
  const l1 = document.createElement('link');
  l1.rel = 'prefetch';
  l1.href = VIZ_URL;
  l1.as = 'document';
  document.head.appendChild(l1);

  // Prefetch the Plotly bundle
  const l2 = document.createElement('link');
  l2.rel = 'prefetch';
  l2.href = PLOTLY_URL;
  l2.as = 'script';
  l2.crossOrigin = 'anonymous';
  document.head.appendChild(l2);

  // Also fire a fetch so we control caching even on browsers that ignore prefetch
  try {
    fetch(VIZ_URL, { credentials: 'same-origin', cache: 'force-cache' }).catch(() => {});
  } catch (_) {}
}

// Kick off prefetch when user scrolls within ~1200px of the viz frame,
// or when the browser goes idle.
if (vizFrame && 'IntersectionObserver' in window) {
  const prefetchObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          prefetchViz();
          prefetchObserver.disconnect();
        }
      });
    },
    { rootMargin: '1200px 0px' }
  );
  prefetchObserver.observe(vizFrame);
}
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => prefetchViz(), { timeout: 4000 });
} else {
  setTimeout(prefetchViz, 2500);
}

// Animate the loader log lines
function runLoaderLog() {
  if (!vizLogEl) return;
  const lis = vizLogEl.querySelectorAll('li');
  lis.forEach((li, i) => {
    li.style.animationDelay = `${i * 120}ms`;
  });
  // mark each as "active" in sequence
  lis.forEach((li, i) => {
    setTimeout(() => li.classList.add('active'), 400 + i * 700);
  });
}

function launchViz() {
  if (!vizFrame || vizFrame.querySelector('iframe')) return;
  prefetchViz();
  vizFrame.classList.add('loading');
  runLoaderLog();

  const iframe = document.createElement('iframe');
  iframe.src = VIZ_URL;
  iframe.className = 'viz-iframe';
  iframe.title = '3D visualization of Axial Seamount bathymetry and seismicity';
  iframe.loading = 'eager';
  iframe.setAttribute('allow', 'fullscreen');
  iframe.addEventListener('load', () => {
    // small grace period so the WebGL context can mount visibly
    setTimeout(() => {
      vizFrame.classList.remove('loading');
      vizFrame.classList.add('iframe-loaded');
    }, 350);
  });
  vizFrame.appendChild(iframe);
}

if (vizLaunch) vizLaunch.addEventListener('click', launchViz);
