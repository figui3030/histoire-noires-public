document.addEventListener("DOMContentLoaded", function () {
let currentStory = null;
let currentDifficulty = 'moyen';
let game = null;
let narratedClues = [];
let revealedCount = 0;      // nombre d'indices déjà révélés (dévoilés un par un)
let currentPageIndex = -1;  // page actuellement affichée dans le dossier
let eliminated = new Set();

// ---------- Carnet mobile ----------
const NOTEBOOK_PAGE_SIZE = 12;
let notebookPages = [];       // tableau de tableaux de noms
let notebookLetterIndex = {}; // { 'A': indexDePage, ... }
let notebookPageIndex = 0;

const screens = {
  stories: document.getElementById('screen-stories'),
  prologue: document.getElementById('screen-prologue'),
  menu: document.getElementById('screen-menu'),
  game: document.getElementById('screen-game'),
  result: document.getElementById('screen-result')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function isMobileLayout() {
  return window.matchMedia('(max-width: 759px)').matches;
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
  renderPrologue(story);
  showScreen('prologue');
}

// ============================================================
// Écran 2 : prologue
// ============================================================
function renderPrologue(story) {
  document.getElementById('prologue-title').textContent = `${story.icon} ${story.introTitle}`;
  const textEl = document.getElementById('prologue-text');
  textEl.innerHTML = story.introParagraphs.map(p => `<p>${p}</p>`).join('');

  const charsEl = document.getElementById('prologue-characters');
  charsEl.innerHTML = '';
  if (story.characters && story.characters.length) {
    story.characters.forEach(ch => {
      const img = document.createElement('img');
      img.src = ch.img;
      img.alt = ch.name || ch.role;
      charsEl.appendChild(img);
    });
    charsEl.style.display = 'flex';
  } else {
    charsEl.style.display = 'none';
  }
}

document.getElementById('btn-back-stories-2').addEventListener('click', () => showScreen('stories'));
document.getElementById('btn-to-menu').addEventListener('click', () => {
  setupMenu(currentStory);
  showScreen('menu');
});
document.getElementById('btn-back-prologue').addEventListener('click', () => showScreen('prologue'));

// ============================================================
// Écran 3 : choix de la difficulté
// ============================================================
function setupMenu(story) {
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
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-replay').addEventListener('click', () => showScreen('stories'));
document.getElementById('btn-menu').addEventListener('click', () => showScreen('menu'));

// ============================================================
// Onglets (Indices / Suspects)
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
// Effet générique "page qui tourne"
// ============================================================
function flipPage(pageEl, updateFn, direction) {
  const outClass = direction === 'next' ? 'flip-out-next' : 'flip-out-prev';
  const inStartClass = direction === 'next' ? 'flip-in-start-next' : 'flip-in-start-prev';
  pageEl.classList.add(outClass);
  setTimeout(() => {
    updateFn();
    pageEl.classList.remove(outClass);
    pageEl.classList.add(inStartClass);
    void pageEl.offsetWidth; // force reflow
    pageEl.classList.remove(inStartClass);
  }, 280);
}

// ============================================================
// Écran 4 : partie — dossier d'indices
// ============================================================
function startGame() {
  const size = computeDifficultyCount(currentStory, currentDifficulty);
  const maxClues = Math.max(12, Math.ceil(Math.log2(Math.max(size, 2))) + 9);
  game = window.GameEngine.generateGame(currentStory.pool, size, maxClues);
  narratedClues = window.narrateClues(currentStory, game.faits);
  revealedCount = 0;
  currentPageIndex = -1;
  eliminated = new Set();

  document.getElementById('tab-btn-clues').textContent = currentStory.clueTitle;
  document.getElementById('tab-btn-suspects').textContent = currentStory.suspectsTitle;
  document.getElementById('accuse-input').placeholder = currentStory.accuseLabel;
  document.getElementById('btn-accuse').textContent = currentStory.accuseButton;
  document.getElementById('accuse-input').value = '';
  document.getElementById('filter-input').value = '';

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-btn-clues').classList.add('active');
  document.getElementById('tab-clues').classList.add('active');

  renderSuspects();
  revealFirstClue();
  updateStats();
  showScreen('game');
}

function updateStats() {
  const total = game.pool.length;
  const remaining = total - eliminated.size;
  document.getElementById('stat-remaining').textContent = `${remaining}/${total} noms`;
  document.getElementById('stat-clue-count').textContent = `${revealedCount}/${narratedClues.length} indices`;
}

function renderCluePageContent() {
  const numberEl = document.getElementById('clue-page-number');
  const contentEl = document.getElementById('clue-page-content');
  if (currentPageIndex < 0) {
    numberEl.textContent = '';
    contentEl.innerHTML = '<div class="page-placeholder">Le dossier est encore fermé...</div>';
  } else {
    numberEl.textContent = `Page ${currentPageIndex + 1} / ${narratedClues.length}`;
    contentEl.innerHTML = `<p>${narratedClues[currentPageIndex]}</p>`;
  }
  updatePageNav();
}

function updatePageNav() {
  const prevBtn = document.getElementById('btn-prev-clue');
  const nextBtn = document.getElementById('btn-next-clue');
  const indicator = document.getElementById('clue-page-indicator');

  prevBtn.disabled = currentPageIndex <= 0;

  const canRevealNew = revealedCount < narratedClues.length && currentPageIndex >= revealedCount - 1;
  if (canRevealNew) {
    nextBtn.textContent = currentStory.nextClueLabel;
    nextBtn.disabled = false;
    nextBtn.classList.add('next-action');
  } else if (currentPageIndex < revealedCount - 1) {
    nextBtn.textContent = '▶';
    nextBtn.disabled = false;
    nextBtn.classList.remove('next-action');
  } else {
    nextBtn.textContent = '▶';
    nextBtn.disabled = true;
    nextBtn.classList.remove('next-action');
  }
  indicator.textContent = currentPageIndex < 0 ? '' : `${currentPageIndex + 1}/${narratedClues.length}`;
}

function revealFirstClue() {
  revealedCount = 1;
  currentPageIndex = 0;
  renderCluePageContent();
}

document.getElementById('btn-next-clue').addEventListener('click', () => {
  const pageEl = document.getElementById('clue-page');
  if (currentPageIndex >= revealedCount - 1 && revealedCount < narratedClues.length) {
    // Révèle un nouvel indice et avance dessus
    flipPage(pageEl, () => {
      revealedCount++;
      currentPageIndex++;
      renderCluePageContent();
      updateStats();
    }, 'next');
  } else if (currentPageIndex < revealedCount - 1) {
    flipPage(pageEl, () => {
      currentPageIndex++;
      renderCluePageContent();
    }, 'next');
  }
});

document.getElementById('btn-prev-clue').addEventListener('click', () => {
  if (currentPageIndex <= 0) return;
  const pageEl = document.getElementById('clue-page');
  flipPage(pageEl, () => {
    currentPageIndex--;
    renderCluePageContent();
  }, 'prev');
});

// ============================================================
// Onglet suspects : grille (desktop) ou carnet (mobile)
// ============================================================
function renderSuspects() {
  const mobile = isMobileLayout();
  document.getElementById('suspects-grid-view').style.display = mobile ? 'none' : 'flex';
  document.getElementById('notebook-view').style.display = mobile ? 'flex' : 'none';

  if (mobile) {
    buildNotebook();
  } else {
    buildGrid();
  }
}

// ---------- Grille (desktop) ----------
function buildGrid() {
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
      toggleEliminated(p.nom);
      chip.classList.toggle('eliminated');
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

function toggleEliminated(nom) {
  if (eliminated.has(nom)) eliminated.delete(nom);
  else eliminated.add(nom);
  updateStats();
}

// ---------- Carnet (mobile) ----------
function buildNotebook() {
  const sorted = game.pool.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  notebookPages = [];
  notebookLetterIndex = {};
  for (let i = 0; i < sorted.length; i += NOTEBOOK_PAGE_SIZE) {
    notebookPages.push(sorted.slice(i, i + NOTEBOOK_PAGE_SIZE));
  }
  notebookPages.forEach((page, pageIdx) => {
    page.forEach(p => {
      const letter = window.GameEngine.normalize(p.nom)[0].toUpperCase();
      if (!(letter in notebookLetterIndex)) notebookLetterIndex[letter] = pageIdx;
    });
  });

  renderNotebookTabs();
  notebookPageIndex = 0;
  renderNotebookPageContent();
}

function renderNotebookTabs() {
  const tabsEl = document.getElementById('notebook-tabs');
  tabsEl.innerHTML = '';
  Object.keys(notebookLetterIndex).sort().forEach(letter => {
    const btn = document.createElement('button');
    btn.className = 'notebook-tab';
    btn.textContent = letter;
    btn.dataset.letter = letter;
    btn.addEventListener('click', () => {
      goToNotebookPage(notebookLetterIndex[letter]);
    });
    tabsEl.appendChild(btn);
  });
}

function currentNotebookActiveLetter() {
  const page = notebookPages[notebookPageIndex];
  if (!page || !page.length) return null;
  return window.GameEngine.normalize(page[0].nom)[0].toUpperCase();
}

function renderNotebookPageContent() {
  const contentEl = document.getElementById('notebook-page-content');
  contentEl.innerHTML = '';
  const page = notebookPages[notebookPageIndex] || [];
  page.forEach(p => {
    const row = document.createElement('div');
    row.className = 'notebook-name-row';
    if (eliminated.has(p.nom)) row.classList.add('eliminated');
    row.innerHTML = `<span>${p.nom}</span>`;
    row.addEventListener('click', () => {
      toggleEliminated(p.nom);
      row.classList.toggle('eliminated');
    });
    contentEl.appendChild(row);
  });

  document.getElementById('notebook-page-indicator').textContent =
    `${notebookPageIndex + 1}/${notebookPages.length}`;
  document.getElementById('btn-prev-notebook').disabled = notebookPageIndex <= 0;
  document.getElementById('btn-next-notebook').disabled = notebookPageIndex >= notebookPages.length - 1;

  const active = currentNotebookActiveLetter();
  document.querySelectorAll('.notebook-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.letter === active);
  });
}

function goToNotebookPage(targetIndex) {
  if (targetIndex === notebookPageIndex) return;
  const direction = targetIndex > notebookPageIndex ? 'next' : 'prev';
  const pageEl = document.getElementById('notebook-page');
  flipPage(pageEl, () => {
    notebookPageIndex = targetIndex;
    renderNotebookPageContent();
  }, direction);
}

document.getElementById('btn-next-notebook').addEventListener('click', () => {
  if (notebookPageIndex < notebookPages.length - 1) goToNotebookPage(notebookPageIndex + 1);
});
document.getElementById('btn-prev-notebook').addEventListener('click', () => {
  if (notebookPageIndex > 0) goToNotebookPage(notebookPageIndex - 1);
});

document.getElementById('notebook-search').addEventListener('input', (e) => {
  const q = window.GameEngine.normalize(e.target.value.trim());
  if (!q) return;
  const sorted = game.pool.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const found = sorted.find(p => window.GameEngine.normalize(p.nom).startsWith(q));
  if (found) {
    const idx = sorted.indexOf(found);
    const pageIdx = Math.floor(idx / NOTEBOOK_PAGE_SIZE);
    if (pageIdx !== notebookPageIndex) goToNotebookPage(pageIdx);
  }
});

window.addEventListener('resize', () => {
  if (game && screens.game.classList.contains('active')) {
    renderSuspects();
  }
});

// ============================================================
// Accusation
// ============================================================
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
  const stampEl = document.getElementById('result-stamp');
  const data = correct
    ? currentStory.resultWin(game.coupable.nom, revealedCount, narratedClues.length)
    : currentStory.resultLose(game.coupable.nom);

  content.innerHTML = `
    <h1>${data.title}</h1>
    ${data.lines.map(l => `<p>${l}</p>`).join('')}
  `;

  stampEl.textContent = data.stamp;
  stampEl.className = 'stamp ' + (data.stampType === 'win' ? 'win' : 'lose');
  // Relance l'animation d'impact à chaque nouvelle partie
  stampEl.style.animation = 'none';
  void stampEl.offsetWidth;
  stampEl.style.animation = '';

  showScreen('result');
}

// ============================================================
// PWA : enregistrement du service worker
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js?v=4').catch(() => {});
  });
}

// ---------- Démarrage ----------
try {
  if (!Array.isArray(window.STORIES) || window.STORIES.length === 0) {
    throw new Error('Les histoires ne sont pas chargées.');
  }
  renderStoriesList();
} catch (error) {
  console.error('Erreur au démarrage de Histoires Noires :', error);
  const list = document.getElementById('stories-list');
  if (list) {
    list.innerHTML = '<p style=\"padding:16px;text-align:center;color:#d7c7b5\">Impossible de charger les affaires. Rechargez la page.</p>';
  }
}


});
