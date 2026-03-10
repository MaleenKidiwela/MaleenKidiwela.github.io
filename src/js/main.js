// ===== CUSTOM CURSOR =====
const cursorDot  = document.querySelector('.cursor-dot');
const cursorRing = document.querySelector('.cursor-ring');

let mouseX = 0, mouseY = 0;
let ringX  = 0, ringY  = 0;

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  cursorDot.style.left = mouseX + 'px';
  cursorDot.style.top  = mouseY + 'px';
});

// Lag the ring for a trailing effect
function animateCursor() {
  ringX += (mouseX - ringX) * 0.12;
  ringY += (mouseY - ringY) * 0.12;
  cursorRing.style.left = ringX + 'px';
  cursorRing.style.top  = ringY + 'px';
  requestAnimationFrame(animateCursor);
}
animateCursor();

// Hover state for interactive elements
document.querySelectorAll('a, button, .glass-card, .tag').forEach((el) => {
  el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
  el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
});

// ===== SCROLL REVEAL =====
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

// ===== ACTIVE NAV LINK =====
const sections = document.querySelectorAll('section[id]');
const navLinks  = document.querySelectorAll('.nav-links a');

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
  { rootMargin: '-40% 0px -55% 0px' }
);

sections.forEach((s) => sectionObserver.observe(s));

// ===== MOBILE NAV =====
const navToggle   = document.querySelector('.nav-toggle');
const navLinksList = document.querySelector('.nav-links');

navToggle.addEventListener('click', () => navLinksList.classList.toggle('open'));

navLinksList.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => navLinksList.classList.remove('open'));
});

// ===== HERO PARALLAX ORBS =====
const orbs = document.querySelectorAll('.orb');
const grid = document.querySelector('.grid-overlay');

window.addEventListener('mousemove', (e) => {
  const cx = window.innerWidth  / 2;
  const cy = window.innerHeight / 2;
  const dx = (e.clientX - cx) / cx;
  const dy = (e.clientY - cy) / cy;

  orbs.forEach((orb, i) => {
    const s = (i + 1) * 14;
    orb.style.transform = `translate(${dx * s}px, ${dy * s}px)`;
  });

  if (grid) {
    grid.style.transform = `translate(${dx * 6}px, ${dy * 6}px)`;
  }
});

// ===== CONTACT FORM =====
const contactForm = document.getElementById('contactForm');

contactForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const btn = contactForm.querySelector('button[type="submit"]');
  const original = btn.textContent;

  btn.textContent = 'Transmitting...';
  btn.disabled = true;

  setTimeout(() => {
    btn.textContent = 'Message Sent ✓';
    btn.style.borderColor = '#00ff88';
    btn.style.color = '#00ff88';
    btn.style.boxShadow = '0 0 20px rgba(0,255,136,0.2)';
    contactForm.reset();

    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
      btn.style.borderColor = '';
      btn.style.color = '';
      btn.style.boxShadow = '';
    }, 3500);
  }, 1200);
});

// ===== PROJECT CARD NUMBERS =====
document.querySelectorAll('.project-card').forEach((card, i) => {
  card.setAttribute('data-num', `0${i + 1}`);
});
