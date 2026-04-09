let currentCardIndex = 0;
let isAnimating = false;
let touchStartY = 0;
let snapLockedUntil = 0;
let wheelAccumulator = 0;
let wheelResetTimer = null;

const WHEEL_STEP_THRESHOLD = 85;
const SNAP_LOCK_MS = 800;
const SNAP_ANIM_MS = 180;

async function loadFeed() {
  try {
    const res = await fetch('./data/feed.json?v=6');
    if (!res.ok) throw new Error(`Failed to load feed: ${res.status}`);

    const papers = await res.json();
    const container = document.getElementById('feed');
    container.innerHTML = '';

    if (!Array.isArray(papers) || papers.length === 0) {
      container.innerHTML = `
        <section class="card active no-image">
          <div class="card-inner">
            <div class="title">No papers found</div>
            <div class="meta">Feed loaded, but there were no entries.</div>
            <div class="abstract">Try rerunning your GitHub Action.</div>
          </div>
        </section>
      `;
      return;
    }

    papers.forEach((p, i) => {
      const card = document.createElement('section');
      const cleanSummary = stripHtml(p.summary || '');
      const hasImage = !!p.image;

      card.className = hasImage ? 'card' : 'card no-image';

      const imageHtml = hasImage
        ? `<img class="paper-image" src="${escapeHtml(p.image)}" alt="Image for ${escapeHtml(p.title || 'paper')}" loading="lazy">`
        : '';

      const showExpand = cleanSummary.length > 900;
      const expandButton = showExpand
        ? `<button type="button" onclick="toggleAbstract(${i}, this)">Expand</button>`
        : '';

      card.innerHTML = `
        <div class="card-inner">
          ${imageHtml}
          <div class="title">${escapeHtml(p.title || '')}</div>
          <div class="meta">${escapeHtml(p.journal || '')} — ${escapeHtml(formatDate(p.date || ''))}</div>
          <div class="abstract" id="abs-${i}">${escapeHtml(cleanSummary)}</div>
          <div class="actions">
            ${expandButton}
            <a href="${escapeHtml(p.link || '#')}" target="_blank" rel="noopener noreferrer">Open paper</a>
          </div>
        </div>
      `;

      container.appendChild(card);
    });

    updateActiveCard(0);
    setupObserver();
    setupControls();
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
  }
}

function toggleAbstract(i, btn) {
  const el = document.getElementById(`abs-${i}`);
  if (!el) return;
  el.classList.toggle('expanded');
  if (btn) {
    btn.textContent = el.classList.contains('expanded') ? 'Collapse' : 'Expand';
  }
}

function getCards() {
  return Array.from(document.querySelectorAll('.card'));
}

function clearWheelAccumulator() {
  wheelAccumulator = 0;
  if (wheelResetTimer) {
    clearTimeout(wheelResetTimer);
    wheelResetTimer = null;
  }
}

function scheduleWheelAccumulatorReset() {
  if (wheelResetTimer) clearTimeout(wheelResetTimer);
  wheelResetTimer = setTimeout(() => {
    wheelAccumulator = 0;
    wheelResetTimer = null;
  }, 120);
}

function lockSnap(ms = SNAP_LOCK_MS) {
  snapLockedUntil = Date.now() + ms;
  document.body.classList.add('snap-locked');

  clearTimeout(window.__snapUnlockTimer);
  window.__snapUnlockTimer = setTimeout(() => {
    document.body.classList.remove('snap-locked');
  }, ms);
}

function isSnapLocked() {
  return Date.now() < snapLockedUntil;
}

function scrollToCard(index) {
  const cards = getCards();
  if (!cards.length) return;

  const clamped = Math.max(0, Math.min(index, cards.length - 1));
  currentCardIndex = clamped;
  isAnimating = true;

  const top = cards[clamped].offsetTop;

  lockSnap();
  clearWheelAccumulator();

  window.scrollTo(0, top);
  updateActiveCard(clamped);

  requestAnimationFrame(() => {
    window.scrollTo(0, top);
  });

  setTimeout(() => {
    window.scrollTo(0, top);
    isAnimating = false;
  }, SNAP_ANIM_MS);
}

function updateActiveCard(index) {
  getCards().forEach((card, i) => {
    card.classList.toggle('active', i === index);
  });
}

function setupObserver() {
  const cards = getCards();
  const observer = new IntersectionObserver(
    (entries) => {
      let best = null;
      for (const entry of entries) {
        if (!best || entry.intersectionRatio > best.intersectionRatio) {
          best = entry;
        }
      }
      if (best && best.isIntersecting) {
        const idx = cards.indexOf(best.target);
        if (idx >= 0) {
          currentCardIndex = idx;
          updateActiveCard(idx);
        }
      }
    },
    { threshold: [0.5, 0.75, 0.9] }
  );

  cards.forEach(card => observer.observe(card));
}

function setupControls() {
  window.addEventListener(
    'wheel',
    (e) => {
      const absDelta = Math.abs(e.deltaY);

      if (absDelta >= 4) {
        e.preventDefault();
      } else {
        return;
      }

      if (isSnapLocked() || isAnimating) {
        return;
      }

      wheelAccumulator += e.deltaY;
      scheduleWheelAccumulatorReset();

      if (Math.abs(wheelAccumulator) < WHEEL_STEP_THRESHOLD) {
        return;
      }

      const direction = wheelAccumulator > 0 ? 1 : -1;
      clearWheelAccumulator();
      scrollToCard(currentCardIndex + direction);
    },
    { passive: false }
  );

  window.addEventListener(
    'touchstart',
    (e) => {
      if (!e.changedTouches?.length) return;
      touchStartY = e.changedTouches[0].clientY;
    },
    { passive: true }
  );

  window.addEventListener(
    'touchmove',
    (e) => {
      if (isSnapLocked()) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  window.addEventListener(
    'touchend',
    (e) => {
      if (isAnimating || isSnapLocked() || !e.changedTouches?.length) return;

      const touchEndY = e.changedTouches[0].clientY;
      const deltaY = touchStartY - touchEndY;

      if (Math.abs(deltaY) < 70) return;

      if (deltaY > 0) {
        scrollToCard(currentCardIndex + 1);
      } else {
        scrollToCard(currentCardIndex - 1);
      }
    },
    { passive: true }
  );

  window.addEventListener('keydown', (e) => {
    if (isAnimating || isSnapLocked()) return;

    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      scrollToCard(currentCardIndex + 1);
    }

    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      scrollToCard(currentCardIndex - 1);
    }
  });

  window.addEventListener(
    'scroll',
    () => {
      const cards = getCards();
      if (!cards.length) return;

      const targetTop = cards[currentCardIndex].offsetTop;

      if (isSnapLocked() || isAnimating) {
        if (window.scrollY !== targetTop) {
          window.scrollTo(0, targetTop);
        }
        return;
      }

      clearTimeout(window.__snapBackTimer);
      window.__snapBackTimer = setTimeout(() => {
        const drift = Math.abs(window.scrollY - targetTop);
        if (drift > 2) {
          window.scrollTo(0, targetTop);
        }
      }, 40);
    },
    { passive: true }
  );
}

function stripHtml(str) {
  return String(str).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

loadFeed();
