async function loadFeed() {
  const res = await fetch('data/feed.json');
  const papers = await res.json();

  const container = document.getElementById('feed');

  papers.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <div class="title">${p.title}</div>
      <div class="meta">${p.journal} — ${p.date}</div>
      <div class="abstract">${p.summary || ''}</div>
      <br>
      <a href="${p.link}" target="_blank">Read paper</a>
    `;

    container.appendChild(card);
  });
}

loadFeed();
