let currentCardIndex = 0;

async function loadFeed() {
  try {
    const res = await fetch('./data/feed.json?v=10');
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
        ? `<div class="topic-badge inline-topic-badge ${topicClass}">${escapeHtml(topic)}</div>`
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

    setupObserver();
    setupControls();
    updateActiveCard(0);
  } catch (err) {
    console.error(err);
    const container = document.getElementById('feed');
    if (container) {
      container.innerHTML = `
        <section class="card active no-image">
          <div class="card-inner">
            <div class="title">Error loading feed</div>
            <div class="meta">Open the browser console for details.</div>
            <div class="abstract">${escapeHtml(String(err))}</div>
          </div>
        </section>
      `;
    }
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
    { threshold: [0.35, 0.5, 0.75] }
  );

  cards.forEach(card => observer.observe(card));
}

function setupControls() {
  window.addEventListener(
    'scroll',
    () => {
      clearTimeout(window.__scrollTimer);
      window.__scrollTimer = setTimeout(() => {
        updateIndexFromScroll();
      }, 80);
    },
    { passive: true }
  );

  window.addEventListener('keydown', (e) => {
    const cards = getCards();
    if (!cards.length) return;

    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      const next = Math.min(currentCardIndex + 1, cards.length - 1);
      cards[next].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      const prev = Math.max(currentCardIndex - 1, 0);
      cards[prev].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
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

function stripHtml(str) {
  return String(str || '')
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
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

loadFeed();
