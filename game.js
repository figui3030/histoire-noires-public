// ---------- Utilitaires ----------
function normalize(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function hasAccent(str) {
  return normalize(str) !== str.toLowerCase();
}

function hasDoubleLetter(str) {
  const s = normalize(str);
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === s[i + 1]) return true;
  }
  return false;
}

const VOYELLES = ['a', 'e', 'i', 'o', 'u', 'y'];
function isVoyelle(letter) {
  return VOYELLES.includes(normalize(letter));
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Construction du pool selon la difficulté ----------
// "size" est soit un nombre absolu de noms (défini par l'histoire via
// difficultyCounts), soit calculé en pourcentage si l'histoire ne précise
// rien (voir renderer.js). Toujours plafonné à la taille réelle de la base.
function buildPool(basePool, size) {
  const all = shuffle(basePool);
  return all.slice(0, Math.min(size, all.length));
}

// ---------- Génération de clues candidates pour un pool donné ----------
// Chaque clue expose un "fait" brut (fragment de phrase, sans majuscule ni
// point) afin que chaque histoire puisse l'habiller à sa sauce (voir
// narrate() dans data/stories.js).
function candidateClues(pool) {
  const clues = [];
  const lettresPresentes = new Set();
  pool.forEach(p => normalize(p.nom).split('').forEach(c => lettresPresentes.add(c)));

  const genresPresents = new Set(pool.map(p => p.genre));

  // Genre (ignoré automatiquement si tout le pool a le même genre : le test
  // ne réduira jamais rien, donc il ne sera simplement jamais choisi).
  if (genresPresents.size > 1) {
    clues.push({
      fait: (c) => `${c.genre === 'F' ? "il s'agit d'une femme" : "il s'agit d'un homme"}`,
      test: (p, c) => p.genre === c.genre
    });
  }

  clues.push({
    fait: (c) => `son prénom contient exactement ${c.nom.length} lettres`,
    test: (p, c) => p.nom.length === c.nom.length
  });
  clues.push({
    fait: (c) => `son prénom contient plus de ${c.nom.length - 1} lettres`,
    test: (p, c) => p.nom.length > c.nom.length - 1
  });
  clues.push({
    fait: (c) => `son prénom contient moins de ${c.nom.length + 1} lettres`,
    test: (p, c) => p.nom.length < c.nom.length + 1
  });

  clues.push({
    fait: (c) => `son prénom commence par la lettre « ${normalize(c.nom)[0].toUpperCase()} »`,
    test: (p, c) => normalize(p.nom)[0] === normalize(c.nom)[0]
  });
  clues.push({
    fait: (c) => `son prénom se termine par la lettre « ${normalize(c.nom).slice(-1).toUpperCase()} »`,
    test: (p, c) => normalize(p.nom).slice(-1) === normalize(c.nom).slice(-1)
  });

  clues.push({
    fait: (c) => `son prénom commence par une ${isVoyelle(normalize(c.nom)[0]) ? 'voyelle' : 'consonne'}`,
    test: (p, c) => isVoyelle(normalize(p.nom)[0]) === isVoyelle(normalize(c.nom)[0])
  });

  ['a','e','i','o','u','n','m','l','r','s','t'].forEach(letter => {
    if (!lettresPresentes.has(letter)) return;
    clues.push({
      fait: (c) => normalize(c.nom).includes(letter)
        ? `son prénom contient la lettre « ${letter.toUpperCase()} »`
        : `son prénom ne contient PAS la lettre « ${letter.toUpperCase()} »`,
      test: (p, c) => normalize(p.nom).includes(letter) === normalize(c.nom).includes(letter)
    });
  });

  clues.push({
    fait: (c) => hasDoubleLetter(c.nom)
      ? `son prénom contient une lettre répétée deux fois de suite`
      : `son prénom ne contient aucune lettre répétée deux fois de suite`,
    test: (p, c) => hasDoubleLetter(p.nom) === hasDoubleLetter(c.nom)
  });

  clues.push({
    fait: (c) => hasAccent(c.nom)
      ? `son prénom contient un accent`
      : `son prénom ne contient aucun accent`,
    test: (p, c) => hasAccent(p.nom) === hasAccent(c.nom)
  });

  const repere = randomFrom(pool);
  clues.push({
    fait: (c) => {
      const cn = normalize(c.nom), rn = normalize(repere.nom);
      return cn === rn
        ? `son prénom est « ${repere.nom} »`
        : `son prénom vient ${cn < rn ? 'AVANT' : 'APRÈS'} « ${repere.nom} » dans l'ordre alphabétique`;
    },
    test: (p, c) => {
      const cn = normalize(c.nom), rn = normalize(repere.nom), pn = normalize(p.nom);
      if (cn === rn) return pn === rn;
      return (pn < rn) === (cn < rn);
    }
  });

  return clues;
}

// ---------- Génération d'une partie ----------
// maxClues = plafond ; l'algorithme vise à résoudre pile autour de ce nombre
// en choisissant à chaque tour l'indice qui rapproche le plus la taille du
// groupe restant d'une trajectoire idéale vers 1 suspect.
function generateGame(basePool, size, maxClues = 12) {
  const pool = buildPool(basePool, size);
  const coupable = randomFrom(pool);

  let remaining = pool.slice();
  const usedFaits = [];

  while (remaining.length > 1 && usedFaits.length < maxClues) {
    const candidates = shuffle(candidateClues(pool));
    const stepsLeft = Math.max(1, maxClues - usedFaits.length);
    const target = Math.max(1, Math.pow(remaining.length, 1 - 1 / stepsLeft));

    let bestClue = null;
    let bestRemaining = null;
    let bestScore = Infinity;

    for (const clue of candidates) {
      const newRemaining = remaining.filter(p => clue.test(p, coupable));
      if (newRemaining.length < remaining.length && newRemaining.length > 0) {
        const score = Math.abs(newRemaining.length - target);
        if (score < bestScore) {
          bestScore = score;
          bestClue = clue;
          bestRemaining = newRemaining;
        }
      }
    }

    if (!bestClue) break;

    usedFaits.push(bestClue.fait(coupable));
    remaining = bestRemaining;
  }

  return {
    coupable,
    pool,
    faits: usedFaits,
    solved: remaining.length === 1
  };
}

window.GameEngine = { generateGame, normalize };
