let currentStory = null;
let currentDifficulty = 'moyen';
let game = null;
let narratedClues = [];
let revealedClues = 0;
let eliminated = new Set();

const screens = {
  stories: document.getElementById('screen-stories'),
  menu: document.getElementById('screen-menu'),
  game: document.getElementById('screen-game'),
  result: document.getElementById('screen-result')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ============================================================
// Écran 1 : choix de l'histoire
// ============================================================
function renderStoriesList() {
  const list = document.getElementById('stories-list');
  list.innerHTML = '';
  window.STORIES.forEach(story => {
    const card = document.createElement('div');
    card.className = 'story-card';
    card.dataset.themeCard = story.theme;
    card.innerHTML = `
      <span class="story-icon">${story.icon}</span>
      <div class="story-title">${story.title}</div>
      <div class="story-tagline">${story.tagline}</div>
    `;
    card.addEventListener('click', () => selectStory(story));
    list.appendChild(card);
  });
}

function computeDifficultyCount(story, diff) {
  if (story.difficultyCounts && story.difficultyCounts[diff] != null) {
    return Math.min(story.difficultyCounts[diff], story.pool.length);
  }
  const total = story.pool.length;
  if (diff === 'facile') return Math.max(10, Math.round(total * 0.35));
  if (diff === 'moyen') return Math.max(15, Math.round(total * 0.65));
  return total;
}

function selectStory(story) {
  currentStory = story;
  document.body.setAttribute('data-theme', story.theme);

  document.getElementById('menu-title').textContent = `${story.icon} ${story.title}`;
  document.getElementById('menu-tagline').textContent = story.tagline;
  document.getElementById('menu-intro').textContent = story.menuIntro;
  document.getElementById('btn-start').textContent =
    story.id === 'contrat' ? 'Ouvrir le dossier' : "Commencer l'enquête";

  const diffContainer = document.getElementById('difficulty-options');
  diffContainer.innerHTML = '';
  ['facile', 'moyen', 'difficile'].forEach(diff => {
    const [label, suffix] = story.difficultyLabels[diff];
    const count = computeDifficultyCount(story, diff);
    const btn = document.createElement('button');
    btn.className = 'diff-btn';
    btn.dataset.diff = diff;
    btn.innerHTML = `<span>${label}</span><span>${count} ${suffix}</span>`;
    btn.addEventListener('click', () => {
      diffContainer.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentDifficulty = diff;
    });
    diffContainer.appendChild(btn);
  });
  diffContainer.querySelector('.diff-btn[data-diff="moyen"]').classList.add('selected');
  currentDifficulty = 'moyen';

  showScreen('menu');
}

document.getElementById('btn-back-stories').addEventListener('click', () => showScreen('stories'));
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-replay').addEventListener('click', () => showScreen('stories'));
document.getElementById('btn-menu').addEventListener('click', () => showScreen('menu'));

// ============================================================
// Onglets (Indices / Suspects) — remplace les 2 panneaux côte à côte
// ============================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ============================================================
// Écran 3 : partie
// ============================================================
function startGame() {
  const size = computeDifficultyCount(currentStory, currentDifficulty);
  const maxClues = Math.max(12, Math.ceil(Math.log2(Math.max(size, 2))) + 9);
  game = window.GameEngine.generateGame(currentStory.pool, size, maxClues);
  narratedClues = window.narrateClues(currentStory, game.faits);
  revealedClues = 0;
  eliminated = new Set();

  document.getElementById('tab-btn-clues').textContent = currentStory.clueTitle;
  document.getElementById('tab-btn-suspects').textContent = currentStory.suspectsTitle;
  document.getElementById('btn-next-clue').textContent = currentStory.nextClueLabel;
  document.getElementById('accuse-input').placeholder = currentStory.accuseLabel;
  document.getElementById('btn-accuse').textContent = currentStory.accuseButton;

  document.getElementById('clues-list').innerHTML = '';
  document.getElementById('btn-next-clue').disabled = false;
  document.getElementById('filter-input').value = '';
  document.getElementById('accuse-input').value = '';

  // Revenir sur l'onglet "indices" par défaut à chaque nouvelle partie
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-btn-clues').classList.add('active');
  document.getElementById('tab-clues').classList.add('active');

  renderSuspects();
  updateStats();
  showScreen('game');
  revealNextClue();
}

function updateStats() {
  const total = game.pool.length;
  const remaining = total - eliminated.size;
  document.getElementById('stat-remaining').textContent = `${remaining}/${total} noms`;
  document.getElementById('stat-clue-count').textContent = `${revealedClues}/${narratedClues.length} indices`;
}

document.getElementById('btn-next-clue').addEventListener('click', revealNextClue);

function revealNextClue() {
  if (revealedClues >= narratedClues.length) return;
  const li = document.createElement('li');
  li.textContent = narratedClues[revealedClues];
  document.getElementById('clues-list').appendChild(li);
  revealedClues++;
  if (revealedClues >= narratedClues.length) {
    document.getElementById('btn-next-clue').disabled = true;
  }
  updateStats();
}

function renderSuspects() {
  const grid = document.getElementById('suspects-grid');
  grid.innerHTML = '';
  const sorted = game.pool.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  sorted.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'suspect-chip';
    chip.textContent = p.nom;
    chip.dataset.nom = p.nom;
    if (eliminated.has(p.nom)) chip.classList.add('eliminated');
    chip.addEventListener('click', () => {
      if (eliminated.has(p.nom)) eliminated.delete(p.nom);
      else eliminated.add(p.nom);
      chip.classList.toggle('eliminated');
      updateStats();
    });
    grid.appendChild(chip);
  });
}

document.getElementById('filter-input').addEventListener('input', (e) => {
  const q = window.GameEngine.normalize(e.target.value);
  document.querySelectorAll('.suspect-chip').forEach(chip => {
    const match = window.GameEngine.normalize(chip.dataset.nom).includes(q);
    chip.style.display = match ? '' : 'none';
  });
});

document.getElementById('btn-accuse').addEventListener('click', accuse);
document.getElementById('accuse-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') accuse();
});

function accuse() {
  const guess = window.GameEngine.normalize(document.getElementById('accuse-input').value.trim());
  if (!guess) return;
  const correct = window.GameEngine.normalize(game.coupable.nom) === guess;
  showResult(correct);
}

function showResult(correct) {
  const content = document.getElementById('result-content');
  const data = correct
    ? currentStory.resultWin(game.coupable.nom, revealedClues)
    : currentStory.resultLose(game.coupable.nom);
  content.innerHTML = `
    <h1>${data.title}</h1>
    ${data.lines.map(l => `<p>${l}</p>`).join('')}
  `;
  showScreen('result');
}

// ============================================================
// PWA : enregistrement du service worker (fonctionnement hors ligne)
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {
      // Si le service worker échoue (ex: ouverture en local sans serveur),
      // le jeu continue de fonctionner normalement, juste sans mode hors ligne.
    });
  });
}

// ---------- Démarrage ----------
renderStoriesList();
