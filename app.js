let isAnimating = false;
let touchStartY = 0;
let touchEndY = 0;
let currentCardIndex = 0;

async function loadFeed() {
  const res = await fetch('./data/feed.json');
  const papers = await res.json();

  const container = document.getElementById('feed');

  papers.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'card';

    const cleanSummary = (p.summary || '')
      .replace(/<[^>]*>/g, '')
      .trim();

    const imageHtml = p.image
      ? `<img class="paper-image" src="${p.image}" alt="Related image for ${escapeHtml(p.title)}">`
      : '';

    card.innerHTML = `
      <div class="card-inner">
        ${imageHtml}
        <div class="title">${escapeHtml(p.title || '')}</div>
        <div class="meta">${escapeHtml(p.journal || '')} — ${escapeHtml(p.date || '')}</div>

        <div class="abstract" id="abs-${i}">
          ${escapeHtml(cleanSummary)}
        </div>

        <div class="actions">
          <button onclick="toggleAbstract(${i})">Expand</button>
          <a href="${p.link}" target="_blank" rel="noopener noreferrer">Open paper</a>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  setupActiveCardObserver();
  setupSwipeControls();
  updateActiveCard(0);
}

function toggleAbstract(i) {
  const el = document.getElementById(`abs-${i}`);
  if (!el) return;
  el.classList.toggle('expanded');
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
      threshold: [0.4, 0.6, 0.8]
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
      }, 350);
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
