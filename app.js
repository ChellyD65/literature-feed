async function loadFeed() {
  const res = await fetch('./data/feed.json');
  const papers = await res.json();

  const container = document.getElementById('feed');

  papers.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'card';

    const cleanSummary = (p.summary || "")
      .replace(/<[^>]*>/g, '') // strip HTML
      .trim();

    card.innerHTML = `
      <div class="card-inner">
        <div class="title">${p.title}</div>
        <div class="meta">${p.journal} — ${p.date}</div>

        <div class="abstract" id="abs-${i}">
          ${cleanSummary}
        </div>

        <div class="actions">
          <button onclick="toggleAbstract(${i})">Expand</button>
          <a href="${p.link}" target="_blank">Open paper</a>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

function toggleAbstract(i) {
  const el = document.getElementById(`abs-${i}`);
  el.classList.toggle('expanded');
}

loadFeed();
