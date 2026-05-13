let currentCardIndex = 0;
let isAnimating = false;
let wheelAccumulator = 0;
let wheelResetTimer = null;

const WHEEL_STEP_THRESHOLD = 85;
const DESKTOP_WHEEL_LOCK_MS = 650;

async function loadFeed() {
  try {
    const res = await fetch('./data/feed.json?v=8');
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
      const cleanSummary = stripHtml(p.abstract || p.summary || '');
      const hasImage = !!p.image;
      const topic = (p.topic || 'default').trim();

      card.className = hasImage ? 'card' : 'card no-image';

      const topicClass = `topic-${topic.toLowerCase().replace(/\s+/g, '-')}`;
      const topicBadge = topic && topic !== 'default'
        ? `<div class="topic-badge ${topicClass}">${escapeHtml(topic)}</div>`
        : '';

      const imageHtml = hasImage
        ? `
          <div class="image-wrap">
            <img class="paper-image" src="${escapeHtml(p.image)}" alt="Image for ${escapeHtml(p.title || 'paper')}" loading="lazy">
            ${topicBadge}
          </div>
        `
        : '';

      const metaBadges = !hasImage && topic && topic !== 'default'
        ? `<div class="topic-badge ${topicClass}" style="position: static; margin-bottom: 10px;">${escapeHtml(topic)}</div>`
        : '';

      const showExpand = cleanSummary.length > 900;
      const expandButton = showExpand
        ? `<button type="button" onclick="toggleAbstract(${i}, this)">Expand</button>`
        : '';

      card.innerHTML = `
        <div class="card-inner">
          ${imageHtml}
          ${metaBadges}
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

  window.scrollTo({
    top: cards[clamped].offsetTop,
    behavior: 'auto'
  });

  updateActiveCard(clamped);

  setTimeout(() => {
    isAnimating = false;
  }, 180);
}

function updateActiveCard(index) {
  getCards().forEach((card, i) => {
    card.classList.toggle('active', i === index);
  });
}

function setupObserver() {
  const cards = getCards();
  if (!cards.length) return;

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

function updateIndexFromScroll() {
  const cards = getCards();
  if (!cards.length) return;

  const scrollY = window.scrollY;
  let nearestIndex = 0;
  let nearestDistance = Infinity;

  cards.forEach((card, i) => {
    const distance = Math.abs(card.offsetTop - scrollY);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  });

  currentCardIndex = nearestIndex;
  updateActiveCard(nearestIndex);
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

function setupControls() {
  const isTouchDevice =
    window.matchMedia('(pointer: coarse)').matches ||
    'ontouchstart' in window;

  // Mobile/tablet: native touch scrolling + CSS scroll snap.
  if (isTouchDevice) {
    window.addEventListener(
      'scroll',
      () => {
        clearTimeout(window.__mobileActiveTimer);
        window.__mobileActiveTimer = setTimeout(() => {
          updateIndexFromScroll();
        }, 80);
      },
      { passive: true }
    );

    return;
  }

  // Desktop: controlled one-card wheel paging.
  let wheelLocked = false;

  window.addEventListener(
    'wheel',
    (e) => {
      const absDelta = Math.abs(e.deltaY);
      if (absDelta < 30) return;

      e.preventDefault();

      if (wheelLocked || isAnimating) return;

      wheelAccumulator += e.deltaY;
      scheduleWheelAccumulatorReset();

      if (Math.abs(wheelAccumulator) < WHEEL_STEP_THRESHOLD) return;

      const direction = wheelAccumulator > 0 ? 1 : -1;
      clearWheelAccumulator();

      wheelLocked = true;
      scrollToCard(currentCardIndex + direction);

      setTimeout(() => {
        wheelLocked = false;
      }, DESKTOP_WHEEL_LOCK_MS);
    },
    { passive: false }
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
  return String(str)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(dateStr) {
  if (!dateStr) return '';

  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;

  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
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
