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
  result: document.getElementById('screen-result'),
  history: document.getElementById('screen-history'),
  review: document.getElementById('screen-review')
};

// ============================================================
// Joker "indice bonus" & chrono strict
// ============================================================
const JOKER_LIMITS = { facile: 3, moyen: 2, difficile: 1 };
const JOKER_PENALTY = 120;
const STRICT_TIME_LIMITS = { facile: 360, moyen: 300, difficile: 240 }; // secondes
const STRICT_SCORE_BONUS = 1.2;

let jokersUsed = 0;
let strictMode = false;
let strictLimitSeconds = 0;

// ============================================================
// Succès / achievements
// ============================================================
const ACHV_KEY = 'histoiresNoires:v1:achievements';
const ACHIEVEMENTS = [
  { id: 'first_win', icon: '🥇', title: 'Premier sang', desc: 'Résoudre votre première enquête.',
    check: (e, h) => e.correct && h.filter(x => x.correct).length === 1 },
  { id: 'speedrun', icon: '⚡', title: 'Éclair', desc: 'Résoudre une enquête en moins de 60 secondes.',
    check: (e) => e.correct && e.elapsedSeconds < 60 },
  { id: 'one_clue', icon: '🔍', title: 'Sherlock', desc: 'Trouver le coupable dès le premier indice.',
    check: (e) => e.correct && e.revealedCount <= 1 },
  { id: 'hard_win', icon: '🕶️', title: 'Sans filet', desc: 'Gagner en difficulté maximale.',
    check: (e) => e.correct && e.difficulty === 'difficile' },
  { id: 'streak5', icon: '🔥', title: 'Increvable', desc: '5 victoires d\'affilée.',
    check: (e, h) => { let s = 0; for (const x of h) { if (x.correct) s++; else break; } return s >= 5; } },
  { id: 'ten_games', icon: '📚', title: 'Habitué', desc: 'Jouer 10 enquêtes.',
    check: (e, h) => h.length >= 10 },
  { id: 'high_score', icon: '💎', title: 'Perfectionniste', desc: 'Atteindre un score de 2000 ou plus.',
    check: (e) => e.correct && e.score >= 2000 },
  { id: 'strict_win', icon: '⏳', title: 'Contre la montre', desc: 'Gagner en mode chrono strict.',
    check: (e) => e.correct && e.strictMode },
  { id: 'no_joker_hard', icon: '🃏', title: 'Sans filet ni joker', desc: 'Gagner en difficulté maximale sans indice bonus.',
    check: (e) => e.correct && e.difficulty === 'difficile' && (e.jokersUsed || 0) === 0 },
  { id: 'all_stories', icon: '🗂️', title: 'Toutes les enquêtes', desc: 'Gagner au moins une fois chaque affaire disponible.',
    check: (e, h) => {
      const ids = new Set((window.STORIES || []).map(s => s.id));
      const won = new Set(h.filter(x => x.correct).map(x => x.storyId));
      return ids.size > 0 && [...ids].every(id => won.has(id));
    } }
];

function loadAchievements() {
  try {
    const raw = localStorage.getItem(ACHV_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function persistAchievements(map) {
  try { localStorage.setItem(ACHV_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
}

function evaluateAchievements(entry, history) {
  const unlocked = loadAchievements();
  const newly = [];
  ACHIEVEMENTS.forEach(a => {
    if (unlocked[a.id]) return;
    try {
      if (a.check(entry, history)) {
        unlocked[a.id] = Date.now();
        newly.push(a);
      }
    } catch (e) { /* ignore une règle défaillante */ }
  });
  if (newly.length) persistAchievements(unlocked);
  return newly;
}

// ============================================================
// Score & historique (localStorage)
// ============================================================
const HISTORY_KEY = 'histoiresNoires:v1:history';
const MAX_HISTORY_ENTRIES = 300;
const DIFFICULTY_MULTIPLIER = { facile: 1, moyen: 1.6, difficile: 2.5 };
const BASE_SCORE = 1000;

let gameStartTs = null;
let timerInterval = null;

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function startTimer(strict, limitSeconds) {
  stopTimer();
  gameStartTs = Date.now();
  strictMode = !!strict;
  strictLimitSeconds = limitSeconds || 0;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    updateTimerDisplay();
    if (strictMode) {
      const elapsed = elapsedSecondsSinceStart();
      if (elapsed >= strictLimitSeconds) {
        stopTimer();
        timeUp();
      }
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById('stat-timer');
  if (!el) return;
  if (strictMode) {
    const remaining = Math.max(0, strictLimitSeconds - elapsedSecondsSinceStart());
    el.textContent = `⏱️ ${formatTime(remaining)}`;
    el.classList.toggle('timer-warning', remaining <= 30);
  } else {
    el.textContent = `⏱️ ${formatTime(elapsedSecondsSinceStart())}`;
    el.classList.remove('timer-warning');
  }
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function elapsedSecondsSinceStart() {
  return gameStartTs ? (Date.now() - gameStartTs) / 1000 : 0;
}

function computeScore(diff, revealed, totalClues, elapsedSeconds, jokersUsedCount, strict) {
  const mult = DIFFICULTY_MULTIPLIER[diff] || 1;
  const efficiency = totalClues > 0 ? Math.max(0, 1 - (revealed - 1) / totalClues) : 1;
  const timeFactor = Math.min(1, Math.max(0.5, 1 - elapsedSeconds / 900));
  let raw = BASE_SCORE * mult * (0.35 + 0.65 * efficiency) * timeFactor;
  if (strict) raw *= STRICT_SCORE_BONUS;
  raw -= (jokersUsedCount || 0) * JOKER_PENALTY;
  return Math.max(0, Math.round(raw));
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function persistHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY_ENTRIES)));
  } catch (e) { /* stockage indisponible : on ignore silencieusement */ }
}

function getBestScore(storyId, diff) {
  const history = loadHistory();
  return history
    .filter(h => h.storyId === storyId && h.difficulty === diff && h.correct)
    .reduce((max, h) => Math.max(max, h.score), 0);
}

function saveHistoryEntry(entry) {
  const history = loadHistory();
  history.unshift(entry);
  persistHistory(history);
}

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
      updateStrictTimerNote();
    });
    diffContainer.appendChild(btn);
  });
  diffContainer.querySelector('.diff-btn[data-diff="moyen"]').classList.add('selected');
  currentDifficulty = 'moyen';
  document.getElementById('strict-timer-toggle').checked = false;
  updateStrictTimerNote();
}

function updateStrictTimerNote() {
  const limit = STRICT_TIME_LIMITS[currentDifficulty];
  document.getElementById('strict-timer-note').textContent =
    `Limite pour cette difficulté : ${formatTime(limit)}. Bonus de score si activé.`;
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-replay').addEventListener('click', () => showScreen('stories'));
document.getElementById('btn-menu').addEventListener('click', () => { stopTimer(); showScreen('menu'); });

// ---------- Écran Classement ----------
document.getElementById('btn-open-history').addEventListener('click', () => {
  renderHistoryScreen();
  showScreen('history');
});
document.getElementById('btn-back-stories-history').addEventListener('click', () => showScreen('stories'));
document.getElementById('btn-result-history').addEventListener('click', () => {
  renderHistoryScreen();
  showScreen('history');
});
document.getElementById('btn-clear-history').addEventListener('click', () => {
  if (confirm("Effacer tout l'historique et les scores enregistrés sur cet appareil ?")) {
    persistHistory([]);
    renderHistoryScreen();
  }
});

function renderHistoryScreen() {
  const history = loadHistory();
  const summaryEl = document.getElementById('history-summary');
  const listEl = document.getElementById('history-list');
  const achvGridEl = document.getElementById('achievements-grid');

  const totalGames = history.length;
  const wins = history.filter(h => h.correct).length;
  const winRate = totalGames ? Math.round((wins / totalGames) * 100) : 0;
  const bestOverall = history.reduce((max, h) => Math.max(max, h.score || 0), 0);

  summaryEl.innerHTML = `
    <div class="summary-cell"><div class="summary-value">${totalGames}</div><div class="summary-label">Parties</div></div>
    <div class="summary-cell"><div class="summary-value">${winRate}%</div><div class="summary-label">Réussite</div></div>
    <div class="summary-cell"><div class="summary-value">${bestOverall}</div><div class="summary-label">Meilleur score</div></div>
  `;

  const unlocked = loadAchievements();
  achvGridEl.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const isUnlocked = !!unlocked[a.id];
    const badge = document.createElement('div');
    badge.className = 'achievement-badge' + (isUnlocked ? ' unlocked' : '');
    badge.title = `${a.title} — ${a.desc}`;
    badge.innerHTML = `<span class="badge-icon">${a.icon}</span><span class="badge-title">${a.title}</span>`;
    achvGridEl.appendChild(badge);
  });

  listEl.innerHTML = '';
  if (!totalGames) {
    listEl.innerHTML = '<div class="history-empty">Aucune enquête résolue pour l\'instant. Vos scores apparaîtront ici.</div>';
    return;
  }

  const top = history
    .slice()
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 20);

  top.forEach((h, i) => {
    const row = document.createElement('div');
    row.className = 'history-row' + (h.correct ? '' : ' lost');
    const dateStr = h.date ? new Date(h.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
    row.innerHTML = `
      <div class="history-rank">${i + 1}</div>
      <div class="history-icon">${h.icon || '📁'}</div>
      <div class="history-info">
        <div class="history-title">${h.storyTitle || ''}</div>
        <div class="history-meta">${h.difficultyLabel || h.difficulty} · ${formatTime(h.elapsedSeconds || 0)} · ${dateStr}</div>
      </div>
      <div class="history-score">${h.correct ? h.score : '✗'}</div>
    `;
    listEl.appendChild(row);
  });
}

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
  jokersUsed = 0;

  const strictOn = document.getElementById('strict-timer-toggle').checked;

  document.getElementById('tab-btn-clues').textContent = currentStory.clueTitle;
  document.getElementById('tab-btn-suspects').textContent = currentStory.suspectsTitle;
  document.getElementById('accuse-input').placeholder = currentStory.accuseLabel;
  document.getElementById('btn-accuse').textContent = currentStory.accuseButton;
  document.getElementById('accuse-input').value = '';
  document.getElementById('filter-input').value = '';
  document.getElementById('joker-toast').textContent = '';

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-btn-clues').classList.add('active');
  document.getElementById('tab-clues').classList.add('active');

  renderSuspects();
  revealFirstClue();
  updateStats();
  updateJokerButton();
  startTimer(strictOn, STRICT_TIME_LIMITS[currentDifficulty]);
  showScreen('game');
}

function updateJokerButton() {
  const btn = document.getElementById('btn-joker');
  const limit = JOKER_LIMITS[currentDifficulty] || 0;
  const remaining = Math.max(0, limit - jokersUsed);
  btn.textContent = `🃏 Indice bonus (${remaining})`;
  btn.disabled = remaining <= 0;
}

document.getElementById('btn-joker').addEventListener('click', jokerReveal);

function jokerReveal() {
  const limit = JOKER_LIMITS[currentDifficulty] || 0;
  if (jokersUsed >= limit) return;
  const candidates = game.pool.filter(p => p !== game.coupable && !eliminated.has(p.nom));
  if (!candidates.length) return;

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  eliminated.add(pick.nom);
  jokersUsed++;

  renderSuspects();
  updateStats();
  updateJokerButton();

  const toast = document.getElementById('joker-toast');
  toast.textContent = `🃏 « ${pick.nom} » est écarté des soupçons.`;
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
  finalizeGame(correct, { timeUp: false });
}

function timeUp() {
  finalizeGame(false, { timeUp: true });
}

function finalizeGame(correct, opts) {
  stopTimer();
  const elapsedSeconds = strictMode
    ? Math.min(elapsedSecondsSinceStart(), strictLimitSeconds)
    : elapsedSecondsSinceStart();
  const score = correct
    ? computeScore(currentDifficulty, revealedCount, narratedClues.length, elapsedSeconds, jokersUsed, strictMode)
    : 0;
  const previousBest = getBestScore(currentStory.id, currentDifficulty);
  const isRecord = correct && score > previousBest && previousBest > 0;

  const [diffLabel] = currentStory.difficultyLabels[currentDifficulty];
  const entry = {
    storyId: currentStory.id,
    storyTitle: currentStory.title,
    icon: currentStory.icon,
    difficulty: currentDifficulty,
    difficultyLabel: diffLabel,
    correct,
    score,
    revealedCount,
    totalClues: narratedClues.length,
    elapsedSeconds: Math.round(elapsedSeconds),
    jokersUsed,
    strictMode,
    date: Date.now()
  };
  saveHistoryEntry(entry);
  const newAchievements = evaluateAchievements(entry, loadHistory());

  showResult(correct, { score, elapsedSeconds, isRecord, previousBest, newAchievements, timeUp: !!opts.timeUp });
}

function showResult(correct, meta) {
  const content = document.getElementById('result-content');
  const stampEl = document.getElementById('result-stamp');
  const scoreEl = document.getElementById('result-score');
  const achvEl = document.getElementById('result-achievements');
  const data = correct
    ? currentStory.resultWin(game.coupable.nom, revealedCount, narratedClues.length)
    : currentStory.resultLose(game.coupable.nom);

  content.innerHTML = `
    ${meta && meta.timeUp ? `<p class="time-up-banner">⏳ Temps écoulé — l'enquête est classée sans suite.</p>` : ''}
    <h1>${data.title}</h1>
    ${data.lines.map(l => `<p>${l}</p>`).join('')}
  `;

  stampEl.textContent = data.stamp;
  stampEl.className = 'stamp ' + (data.stampType === 'win' ? 'win' : 'lose');
  // Relance l'animation d'impact à chaque nouvelle partie
  stampEl.style.animation = 'none';
  void stampEl.offsetWidth;
  stampEl.style.animation = '';

  if (correct && meta) {
    scoreEl.style.display = 'block';
    scoreEl.innerHTML = `
      <div class="score-label">Score</div>
      <div class="score-value">${meta.score}</div>
      <div class="score-meta">Temps : ${formatTime(meta.elapsedSeconds)} · ${revealedCount}/${narratedClues.length} indices révélés${jokersUsed ? ` · ${jokersUsed} joker(s)` : ''}</div>
      ${meta.isRecord ? `<div class="score-record">🏆 Nouveau record pour cette enquête !</div>` : ''}
    `;
  } else {
    scoreEl.style.display = 'none';
    scoreEl.innerHTML = '';
  }

  achvEl.innerHTML = '';
  if (meta && meta.newAchievements && meta.newAchievements.length) {
    meta.newAchievements.forEach(a => {
      const div = document.createElement('div');
      div.className = 'achievement-toast';
      div.innerHTML = `
        <span class="achievement-icon">${a.icon}</span>
        <span>
          <span class="achievement-title">Succès débloqué : ${a.title}</span><br>
          <span class="achievement-desc">${a.desc}</span>
        </span>
      `;
      achvEl.appendChild(div);
    });
  }

  showScreen('result');
}

// ---------- Relecture des indices ----------
document.getElementById('btn-review-clues').addEventListener('click', () => {
  document.getElementById('review-title').textContent = `${currentStory.icon} ${currentStory.title}`;
  const listEl = document.getElementById('review-list');
  listEl.innerHTML = '';
  narratedClues.forEach((clue, i) => {
    const item = document.createElement('div');
    item.className = 'review-item';
    const wasRevealed = i < revealedCount;
    item.innerHTML = `
      <span class="review-index">${i + 1}</span>
      <span>${clue}${wasRevealed ? '' : ' <em style="opacity:.55">(non consulté pendant la partie)</em>'}</span>
    `;
    if (!wasRevealed) item.style.opacity = '0.6';
    listEl.appendChild(item);
  });
  showScreen('review');
});
document.getElementById('btn-back-review').addEventListener('click', () => showScreen('result'));

// ============================================================
// PWA : enregistrement du service worker
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js?v=7').catch(() => {});
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
