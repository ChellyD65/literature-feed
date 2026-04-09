let currentCardIndex = 0;
let isAnimating = false;
let touchStartY = 0;
let snapLockedUntil = 0;
let wheelAccumulator = 0;
let wheelResetTimer = null;

const WHEEL_STEP_THRESHOLD = 60;   // larger = less reactive
const SNAP_LOCK_MS = 650;          // how long card stays locked after snapping
const SNAP_ANIM_MS = 180;          // internal animation flag duration

async function loadFeed() {
  try {
    const res = await fetch('./data/feed.json?v=5');
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

function lockSnap(ms = SNAP_LOCK_MS) {
  snapLockedUntil = Date.now() + ms;
}

function isSnapLocked() {
  return Date.now() < snapLockedUntil;
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

function scrollToCard(index) {
  const cards = getCards();
  if (!cards.length) return;

  const clamped = Math.max(0, Math.min(index, cards.length - 1));
  currentCardIndex = clamped;
  isAnimating = true;

  const top = cards[clamped].offsetTop;

  window.scrollTo({
    top,
    behavior: 'auto'
  });

  updateActiveCard(clamped);
  clearWheelAccumulator();
  lockSnap();

  setTimeout(() => {
    // force exact alignment again after layout settles
    window.scrollTo({
      top,
      behavior: 'auto'
    });
  }, 0);

  setTimeout(() => {
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

      // Ignore tiny jitter, let browser handle nothing.
      if (absDelta < 4) return;

      // Always suppress native scroll for real wheel movement.
      e.preventDefault();

      // During lock window, swallow everything.
      if (isSnapLocked() || isAnimating) {
        return;
      }

      // Accumulate trackpad/mouse wheel motion until one deliberate step is reached.
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

  // If anything nudges the viewport off-card, snap it back after the lock window.
  window.addEventListener(
    'scroll',
    () => {
      if (isAnimating || isSnapLocked()) return;

      clearTimeout(window.__snapBackTimer);
      window.__snapBackTimer = setTimeout(() => {
        const cards = getCards();
        if (!cards.length) return;

        const targetTop = cards[currentCardIndex].offsetTop;
        const drift = Math.abs(window.scrollY - targetTop);

        if (drift > 2) {
          window.scrollTo({
            top: targetTop,
            behavior: 'auto'
          });
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

loadFeed();let currentCardIndex = 0;
let isAnimating = false;
let touchStartY = 0;

async function loadFeed() {
  try {
    const res = await fetch('./data/feed.json?v=5');
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

function scrollToCard(index) {
  const cards = getCards();
  if (!cards.length) return;

  const clamped = Math.max(0, Math.min(index, cards.length - 1));
  currentCardIndex = clamped;
  isAnimating = true;

  window.scrollTo(0, cards[clamped].offsetTop);
  updateActiveCard(clamped);

  setTimeout(() => {
    isAnimating = false;
  }, 500);
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
      if (Math.abs(e.deltaY) < 30) return;
      e.preventDefault();
      if (isAnimating) return;

      if (e.deltaY > 0) {
        scrollToCard(currentCardIndex + 1);
      } else {
        scrollToCard(currentCardIndex - 1);
      }
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
    'touchend',
    (e) => {
      if (isAnimating || !e.changedTouches?.length) return;
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
    if (isAnimating) return;

    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      scrollToCard(currentCardIndex + 1);
    }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      scrollToCard(currentCardIndex - 1);
    }
  });
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
