let isAnimating = false;
let touchStartY = 0;
let touchEndY = 0;
let currentCardIndex = 0;

async function loadFeed() {
  try {
    const res = await fetch('./data/feed.json');
    if (!res.ok) {
      throw new Error(`Failed to load feed.json: ${res.status}`);
    }

    const papers = await res.json();
    const container = document.getElementById('feed');

    if (!container) {
      throw new Error('Missing #feed container in index.html');
    }

    container.innerHTML = '';

    papers.forEach((p, i) => {
      const card = document.createElement('div');

      const cleanSummary = stripHtml(p.summary || '').trim();
      const hasImage = !!p.image;
      card.className = hasImage ? 'card' : 'card no-image';

      const imageHtml = hasImage
        ? `<img class="paper-image" src="${escapeHtml(p.image)}" alt="Image related to ${escapeHtml(p.title || 'paper')}" loading="lazy" referrerpolicy="no-referrer">`
        : '';

      const showExpand = cleanSummary.length > 900;
      const expandButtonHtml = showExpand
        ? `<button type="button" onclick="toggleAbstract(${i}, this)">Expand</button>`
        : '';

      card.innerHTML = `
        <div class="card-inner">
          ${imageHtml}
          <div class="title">${escapeHtml(p.title || '')}</div>
          <div class="meta">${escapeHtml(p.journal || '')} — ${escapeHtml(formatDate(p.date || ''))}</div>

          <div class="abstract" id="abs-${i}">
            ${escapeHtml(cleanSummary)}
          </div>

          <div class="actions">
            ${expandButtonHtml}
            <a href="${escapeHtml(p.link || '#')}" target="_blank" rel="noopener noreferrer">Open paper</a>
          </div>
        </div>
      `;

      container.appendChild(card);
    });

    setupActiveCardObserver();
    setupSwipeControls();
    updateActiveCard(0);
    markInitialCardsReady();

    if (!papers.length) {
      container.innerHTML = `
        <div class="card active no-image">
          <div class="card-inner">
            <div class="title">No papers found</div>
            <div class="meta">Try rerunning the feed update workflow.</div>
            <div class="abstract">Your feed.json loaded, but it did not contain any paper objects.</div>
          </div>
        </div>
      `;
    }
  } catch (err) {
    console.error('Error loading feed:', err);

    const container = document.getElementById('feed');
    if (container) {
      container.innerHTML = `
        <div class="card active no-image">
          <div class="card-inner">
            <div class="title">Error loading feed</div>
            <div class="meta">Check the browser console and feed.json path.</div>
            <div class="abstract">${escapeHtml(String(err))}</div>
          </div>
        </div>
      `;
    }
  }
}

function toggleAbstract(i, buttonEl) {
  const el = document.getElementById(`abs-${i}`);
  if (!el) return;

  el.classList.toggle('expanded');

  if (buttonEl) {
    buttonEl.textContent = el.classList.contains('expanded') ? 'Collapse' : 'Expand';
  }
}

function getCards() {
  return Array.from(document.querySelectorAll('.card'));
}

function scrollToCard(index) {
  const cards = getCards();
  if (!cards.length) return;

  const clamped = Math.max(0, Math.min(index, cards.length - 1));
  if (clamped === currentCardIndex && isAnimating) return;

  currentCardIndex = clamped;
  isAnimating = true;

  cards[clamped].scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });

  updateActiveCard(clamped);

  window.setTimeout(() => {
    isAnimating = false;
  }, 220);
}

function updateActiveCard(index) {
  const cards = getCards();
  cards.forEach((card, i) => {
    card.classList.toggle('active', i === index);
  });
}

function setupActiveCardObserver() {
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
        const index = cards.indexOf(best.target);
        if (index >= 0) {
          currentCardIndex = index;
          updateActiveCard(index);
        }
      }
    },
    {
      threshold: [0.45, 0.65, 0.85]
    }
  );

  cards.forEach(card => observer.observe(card));
}

function setupSwipeControls() {
  let wheelCooldown = false;

  window.addEventListener(
    'wheel',
    (e) => {
      if (wheelCooldown || isAnimating) return;

      const absDelta = Math.abs(e.deltaY);
      if (absDelta < 35) return;

      wheelCooldown = true;

      if (e.deltaY > 0) {
        scrollToCard(currentCardIndex + 1);
      } else {
        scrollToCard(currentCardIndex - 1);
      }

      window.setTimeout(() => {
        wheelCooldown = false;
      }, 250);
    },
    { passive: true }
  );

  window.addEventListener(
    'touchstart',
    (e) => {
      if (!e.changedTouches || !e.changedTouches.length) return;
      touchStartY = e.changedTouches[0].clientY;
    },
    { passive: true }
  );

  window.addEventListener(
    'touchend',
    (e) => {
      if (isAnimating || !e.changedTouches || !e.changedTouches.length) return;

      touchEndY = e.changedTouches[0].clientY;
      const deltaY = touchStartY - touchEndY;

      if (Math.abs(deltaY) < 80) return;

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

    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      scrollToCard(currentCardIndex + 1);
    }

    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      scrollToCard(currentCardIndex - 1);
    }

    if (e.key === 'Home') {
      e.preventDefault();
      scrollToCard(0);
    }

    if (e.key === 'End') {
      e.preventDefault();
      scrollToCard(getCards().length - 1);
    }
  });
}

function markInitialCardsReady() {
  const cards = getCards();
  cards.forEach((card, i) => {
    if (i === 0) {
      card.classList.add('active');
    }
  });
}

function stripHtml(str) {
  return String(str || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDate(dateStr) {
  if (!dateStr) return '';

  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return dateStr;
  }

  return parsed.toLocaleDateString(undefined, {
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
