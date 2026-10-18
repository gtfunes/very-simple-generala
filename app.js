const STORAGE_KEY = 'generala:v1';
const MAX_PLAYERS = 8;
const NAME_MAX = 20;
const LOG_MAX = 200;
// The rows of the sheet, in order. A face row (1 to 6) scores the face times the dice that show it.
// A combo scores `points`; `made` and `served` name the two ways to get it, in the word's gender.
const CATEGORIES = [
  { id: '1', face: 1, title: 'Al 1' },
  { id: '2', face: 2, title: 'Al 2' },
  { id: '3', face: 3, title: 'Al 3' },
  { id: '4', face: 4, title: 'Al 4' },
  { id: '5', face: 5, title: 'Al 5' },
  { id: '6', face: 6, title: 'Al 6' },
  { id: 'escalera', title: 'Escalera', points: 20, made: 'Armada', served: 'Servida' },
  { id: 'full', title: 'Full', points: 30, made: 'Armado', served: 'Servido' },
  { id: 'poker', title: 'Póker', points: 40, made: 'Armado', served: 'Servido' },
  // «Generala servida gana»: a generala on the first roll wins the game.
  { id: 'generala', title: 'Generala', points: 50, made: 'Armada', winsServed: true },
  // Only after a generala was scored (not crossed out).
  { id: 'doble', title: 'Doble generala', label: 'Doble', points: 100, needs: 'generala' },
];
// «Servida suma 5»: a combo made on the first roll scores this much more.
const SERVIDA_BONUS = 5;
const CROSS = { value: 0, label: '✕', note: 'Tachar', cross: true };

const categoryById = new Map(CATEGORIES.map((category) => [category.id, category]));
const maxPoints = (category) => (category.face ? category.face * 5 : category.points + (category.served ? SERVIDA_BONUS : 0));

const els = {
  banner: document.getElementById('banner'),
  status: document.getElementById('status'),
  sheetWrap: document.querySelector('.sheet-wrap'),
  sheet: document.getElementById('sheet'),
  sheetHead: document.getElementById('sheet-head'),
  sheetBody: document.getElementById('sheet-body'),
  sheetTotal: document.getElementById('sheet-total'),
  undo: document.getElementById('undo'),
  playerCount: document.getElementById('player-count'),
  playerList: document.getElementById('player-list'),
  addPlayer: document.getElementById('add-player'),
  servidaBonus: document.getElementById('servida-bonus'),
  servidaWins: document.getElementById('servida-wins'),
  reset: document.getElementById('reset'),
  picker: document.getElementById('picker'),
  pickerTitle: document.getElementById('picker-title'),
  pickerHint: document.getElementById('picker-hint'),
  pickerOptions: document.getElementById('picker-options'),
  pickerClear: document.getElementById('picker-clear'),
  pickerCancel: document.getElementById('picker-cancel'),
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let state = load();
// The cell the picker is open for: indexes into state.players and CATEGORIES.
let picking = null;
let headCells = [];
let totalCells = [];
// cellButtons[player index][category index]
let cellButtons = [];
let removeButtons = [];
let wakeLock = null;
let wakeLockPending = false;

// --- State -----------------------------------------------------------------

function isScore(category, value) {
  return Number.isInteger(value) && value >= 0 && value <= maxPoints(category);
}

function readScores(scores) {
  const clean = {};
  CATEGORIES.forEach((category) => {
    const value = scores?.[category.id];
    if (isScore(category, value)) clean[category.id] = value;
  });
  return clean;
}

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.players)) return null;
    const players = saved.players
      .filter((p) => p && typeof p.id === 'string' && p.id)
      .slice(0, MAX_PLAYERS)
      .map((p) => ({
        id: p.id,
        name: typeof p.name === 'string' ? p.name.slice(0, NAME_MAX) : '',
        scores: readScores(p.scores),
      }));
    const ids = new Set(players.map((p) => p.id));
    if (players.length === 0 || ids.size !== players.length) return null;
    // Each undo step: who, which row, the value before and after (null = empty), and the winner before.
    const log = (Array.isArray(saved.log) ? saved.log : [])
      .filter((entry) => {
        const category = categoryById.get(entry?.category);
        const valid = (value) => value === null || isScore(category, value);
        return category && ids.has(entry.player) && valid(entry.before) && valid(entry.after);
      })
      .map(({ player, category, before, after, winnerBefore }) => ({
        player,
        category,
        before,
        after,
        winnerBefore: ids.has(winnerBefore) ? winnerBefore : null,
      }))
      .slice(-LOG_MAX);
    return {
      players,
      log,
      winner: ids.has(saved.winner) ? saved.winner : null,
      rules: {
        servidaBonus: saved.rules?.servidaBonus !== false,
        servidaWins: saved.rules?.servidaWins === true,
      },
    };
  } catch {
    // Storage blocked or corrupt.
  }
  return null;
}

function load() {
  return (
    readSaved() ?? {
      players: [
        { id: 'p1', name: '', scores: {} },
        { id: 'p2', name: '', scores: {} },
      ],
      log: [],
      winner: null,
      rules: { servidaBonus: true, servidaWins: false },
    }
  );
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: the game still works, it just won't survive a reload.
  }
}

// Another tab with the same game may have scored; adopt its state so both show the same sheet.
function syncFromStorage() {
  const saved = readSaved();
  if (!saved) return;
  if (els.picker.open) els.picker.close();
  state = saved;
  buildSheet();
  buildPlayerList();
  render();
}

function newId() {
  let n = 1;
  while (state.players.some((p) => p.id === `p${n}`)) n += 1;
  return `p${n}`;
}

// --- Scoring ---------------------------------------------------------------

const filled = (player) => CATEGORIES.filter((category) => player.scores[category.id] !== undefined).length;
const total = (player) => CATEGORIES.reduce((sum, category) => sum + (player.scores[category.id] ?? 0), 0);
const hasScores = () => state.players.some((player) => filled(player) > 0);

function displayName(player) {
  return player.name.trim() || `Jugador ${state.players.indexOf(player) + 1}`;
}

// "Facundo Ezequiel" → "FE", "Jugador 5" → "J5", "Bartolomé" → "Ba".
function initials(name) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => [...word][0].toUpperCase()).join('');
  const [first = '', second = ''] = [...(words[0] ?? '')];
  return first.toUpperCase() + second;
}

function listOf(items) {
  try {
    return new Intl.ListFormat('es', { type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
}

// The game ends with a generala servida (when the rule is on) or when every row of every player is filled.
function winners() {
  if (state.winner) return state.players.filter((player) => player.id === state.winner);
  if (!state.players.every((player) => filled(player) === CATEGORIES.length)) return [];
  const best = Math.max(...state.players.map(total));
  return state.players.filter((player) => total(player) === best);
}

// The player with the fewest filled rows; on a tie, the first one in the list.
function turnPlayer() {
  if (winners().length) return null;
  return state.players.reduce((best, player) => (filled(player) < filled(best) ? player : best));
}

// The buttons of the picker for one row, before «Tachar».
function scoreOptions(category, player) {
  if (category.face) {
    return [1, 2, 3, 4, 5].map((dice) => ({
      value: dice * category.face,
      note: dice === 1 ? '1 dado' : `${dice} dados`,
    }));
  }
  const options = [{ value: category.points, note: category.made ?? '' }];
  if (category.served && state.rules.servidaBonus) {
    options.push({ value: category.points + SERVIDA_BONUS, note: category.served });
  }
  if (category.winsServed && state.rules.servidaWins) {
    options.push({ value: category.points, label: '¡Gana!', note: 'Servida', wins: true });
  }
  if (category.needs && !(player.scores[category.needs] > 0)) options[0].disabled = true;
  return options;
}

// value: the points, 0 to cross the row out, or null to empty it again.
function setScore(player, category, value, wins = false) {
  const before = player.scores[category.id] ?? null;
  const winnerBefore = state.winner;
  if (value === null) delete player.scores[category.id];
  else player.scores[category.id] = value;
  if (wins) state.winner = player.id;
  // The winner's generala changed, so it was not a generala servida after all.
  else if (category.winsServed && state.winner === player.id) state.winner = null;
  state.log.push({ player: player.id, category: category.id, before, after: value, winnerBefore });
  if (state.log.length > LOG_MAX) state.log.shift();
  save();
}

function valueWords(value) {
  if (value === null || value === undefined) return 'libre';
  return value === 0 ? 'tachado' : `${value} puntos`;
}

function undoLast() {
  const entry = state.log.at(-1);
  if (!entry) return;
  const player = state.players.find((p) => p.id === entry.player);
  const category = categoryById.get(entry.category);
  const change = entry.after === null ? 'borrado' : valueWords(entry.after);
  if (!window.confirm(`¿Deshacer «${displayName(player)} · ${category.title}: ${change}»?`)) return;
  state.log.pop();
  if (entry.before === null) delete player.scores[category.id];
  else player.scores[category.id] = entry.before;
  state.winner = entry.winnerBefore;
  save();
  render();
}

function newGame() {
  if (hasScores() && !window.confirm('¿Empezar un juego nuevo? Se borran los puntos. Los jugadores quedan.')) return;
  state.players.forEach((player) => {
    player.scores = {};
  });
  state.log = [];
  state.winner = null;
  save();
  render();
}

// --- Players -----------------------------------------------------------------

function addPlayer() {
  if (state.players.length >= MAX_PLAYERS) return;
  state.players.push({ id: newId(), name: '', scores: {} });
  save();
  buildSheet();
  buildPlayerList();
  render();
  els.playerList.lastElementChild?.querySelector('input').focus();
}

// From a tap on a column header: on a phone the name fields are far below the sheet.
function renamePlayer(index) {
  const player = state.players[index];
  if (!player) return;
  const name = window.prompt(`Nombre del jugador ${index + 1}`, player.name);
  if (name === null) return;
  player.name = name.trim().slice(0, NAME_MAX);
  save();
  buildPlayerList();
  render();
}

function removePlayer(index) {
  const player = state.players[index];
  if (!player || state.players.length === 1) return;
  if (filled(player) > 0 && !window.confirm(`¿Quitar a ${displayName(player)}? Se borran sus puntos.`)) return;
  state.players.splice(index, 1);
  state.log = state.log.filter((entry) => entry.player !== player.id);
  state.log.forEach((entry) => {
    if (entry.winnerBefore === player.id) entry.winnerBefore = null;
  });
  if (state.winner === player.id) state.winner = null;
  save();
  buildSheet();
  buildPlayerList();
  render();
}

// --- Picker ------------------------------------------------------------------

function optionButton(option, isCurrent) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'option';
  button.classList.toggle('cross', Boolean(option.cross));
  button.classList.toggle('wins', Boolean(option.wins));
  button.classList.toggle('current', isCurrent);
  if (isCurrent) button.setAttribute('aria-current', 'true');
  button.disabled = Boolean(option.disabled);
  const value = document.createElement('span');
  value.className = 'option-value';
  value.textContent = option.label ?? String(option.value);
  const note = document.createElement('span');
  note.className = 'option-note';
  note.textContent = option.note;
  button.append(value, note);
  button.addEventListener('click', () => pick(option));
  return button;
}

function openPicker(playerIndex, categoryIndex) {
  const player = state.players[playerIndex];
  const category = CATEGORIES[categoryIndex];
  if (!player || !category) return;
  picking = { playerIndex, categoryIndex };
  const current = player.scores[category.id];
  const wonServed = Boolean(category.winsServed) && state.winner === player.id;
  const options = [...scoreOptions(category, player), CROSS];
  els.pickerTitle.textContent = `${displayName(player)} · ${category.title}`;
  const blocked = options.some((option) => option.disabled);
  els.pickerHint.textContent = blocked ? 'Primero hay que anotar la generala.' : '';
  els.pickerHint.hidden = !blocked;
  els.pickerOptions.dataset.cols = String(options.length === 6 ? 3 : options.length);
  els.pickerOptions.replaceChildren(
    ...options.map((option) => optionButton(option, current === option.value && Boolean(option.wins) === wonServed)),
  );
  els.pickerClear.hidden = current === undefined;
  els.picker.showModal();
}

function pick(option) {
  if (!picking) return;
  const { playerIndex, categoryIndex } = picking;
  const player = state.players[playerIndex];
  const category = CATEGORIES[categoryIndex];
  els.picker.close();
  if (!player || !category) return;
  const wasOver = winners().length > 0;
  const firstScore = !hasScores();
  setScore(player, category, option.value, Boolean(option.wins));
  render();
  const endsNow = !wasOver && winners().length > 0;
  if (firstScore) window.track?.('game_start', { players: state.players.length });
  if (endsNow) window.track?.('game_end', { players: state.players.length, servida: Boolean(state.winner) });
  navigator.vibrate?.(endsNow ? [40, 80, 160] : 30);
  if (!reducedMotion.matches && option.value !== null) {
    cellButtons[playerIndex][categoryIndex].animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], {
      duration: 250,
      easing: 'ease-out',
    });
  }
}

// --- Screen wake lock --------------------------------------------------------
// The phone sits on the table between turns, so keep it from locking.

async function keepAwake() {
  if (!('wakeLock' in navigator) || wakeLock || wakeLockPending) return;
  wakeLockPending = true;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {
    // Denied (for example, battery saver): the screen may dim, nothing else breaks.
  } finally {
    wakeLockPending = false;
  }
}

// --- Rendering -------------------------------------------------------------

function categoryLabel(category) {
  if (!category.face) return document.createTextNode(category.label ?? category.title);
  const die = document.createElement('span');
  die.className = 'die';
  die.setAttribute('aria-hidden', 'true');
  die.textContent = String(category.face);
  const label = document.createElement('span');
  label.className = 'sr-only';
  label.textContent = category.title;
  const fragment = document.createDocumentFragment();
  fragment.append(die, label);
  return fragment;
}

// Runs when the players change; render() fills in the names and points.
function buildSheet() {
  const corner = document.createElement('td');
  corner.className = 'corner';
  headCells = state.players.map((_, playerIndex) => {
    const th = document.createElement('th');
    th.scope = 'col';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'head-name';
    button.addEventListener('click', () => renamePlayer(playerIndex));
    th.append(button);
    return th;
  });
  els.sheetHead.replaceChildren(corner, ...headCells);

  cellButtons = state.players.map(() => []);
  const rows = CATEGORIES.map((category, categoryIndex) => {
    const tr = document.createElement('tr');
    // A gap between the face rows and the combos.
    if (!category.face && CATEGORIES[categoryIndex - 1]?.face) tr.className = 'split';
    const th = document.createElement('th');
    th.scope = 'row';
    th.append(categoryLabel(category));
    tr.append(th);
    state.players.forEach((_, playerIndex) => {
      const td = document.createElement('td');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cell';
      button.addEventListener('click', () => openPicker(playerIndex, categoryIndex));
      td.append(button);
      tr.append(td);
      cellButtons[playerIndex][categoryIndex] = button;
    });
    return tr;
  });
  els.sheetBody.replaceChildren(...rows);

  const totalLabel = document.createElement('th');
  totalLabel.scope = 'row';
  totalLabel.textContent = 'Total';
  totalCells = state.players.map(() => document.createElement('td'));
  els.sheetTotal.replaceChildren(totalLabel, ...totalCells);
  // Sets the minimum table width (see .sheet), through CSSOM: the CSP blocks style attributes.
  els.sheet.style.setProperty('--players', String(state.players.length));
}

// A name too long for its column (a phone, many players) shows as initials instead of being cut off.
// The columns have a fixed layout, so the text never changes their width.
function fitHeadNames() {
  headCells.forEach((th, index) => {
    const button = th.firstChild;
    const name = displayName(state.players[index]);
    button.textContent = name;
    if (button.scrollWidth > button.clientWidth) button.textContent = initials(name);
  });
}

function buildPlayerList() {
  removeButtons = [];
  els.playerList.replaceChildren(
    ...state.players.map((player, index) => {
      const li = document.createElement('li');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = player.name;
      input.maxLength = NAME_MAX;
      input.placeholder = `Jugador ${index + 1}`;
      input.autocomplete = 'off';
      input.autocapitalize = 'words';
      input.spellcheck = false;
      input.setAttribute('autocorrect', 'off');
      input.enterKeyHint = 'done';
      input.setAttribute('aria-label', `Nombre del jugador ${index + 1}`);
      input.addEventListener('input', () => {
        state.players[index].name = input.value;
        save();
        render();
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') input.blur();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove';
      remove.textContent = '✕';
      remove.addEventListener('click', () => removePlayer(index));
      removeButtons.push(remove);
      li.append(input, remove);
      return li;
    }),
  );
}

function render() {
  const { players } = state;
  const done = winners();
  const turn = turnPlayer();
  const best = Math.max(...players.map(total));
  const showLeader = players.length > 1 && best > 0;

  players.forEach((player, playerIndex) => {
    const name = displayName(player);
    const isTurn = player === turn;
    headCells[playerIndex].firstChild.setAttribute('aria-label', `Cambiar el nombre de ${name}`);
    headCells[playerIndex].classList.toggle('turn', isTurn);
    CATEGORIES.forEach((category, categoryIndex) => {
      const button = cellButtons[playerIndex][categoryIndex];
      const value = player.scores[category.id];
      button.textContent = value === undefined ? '' : value === 0 ? '✕' : String(value);
      button.classList.toggle('empty', value === undefined);
      button.classList.toggle('crossed', value === 0);
      button.classList.toggle('turn', isTurn);
      button.setAttribute('aria-label', `${name}, ${category.title}: ${valueWords(value)}`);
    });
    totalCells[playerIndex].textContent = String(total(player));
    totalCells[playerIndex].classList.toggle('leader', showLeader && total(player) === best);
    removeButtons[playerIndex].setAttribute('aria-label', `Quitar a ${name}`);
    removeButtons[playerIndex].disabled = players.length === 1;
  });

  const names = listOf(done.map(displayName));
  let banner = '';
  if (state.winner) banner = `¡Generala servida! Ganó ${names}`;
  else if (done.length && players.length === 1) banner = `¡Terminó! ${names} hizo ${best} puntos`;
  else if (done.length === 1) banner = `¡Ganó ${names} con ${best} puntos!`;
  else if (done.length) banner = `¡Empate! ${names} con ${best} puntos`;
  els.banner.textContent = banner;
  els.banner.hidden = !banner;

  if (done.length) els.status.textContent = 'Tocá «Nuevo juego» para jugar otra.';
  else if (!hasScores() && players.every((player) => !player.name.trim())) {
    els.status.textContent = 'Tocá cada nombre para cambiarlo y un casillero para anotar.';
  } else if (!hasScores()) els.status.textContent = `Empieza ${displayName(turn)}. Tocá un casillero para anotar.`;
  else {
    const round = `${filled(turn) + 1} de ${CATEGORIES.length}`;
    els.status.textContent = players.length > 1 ? `Turno de ${displayName(turn)} · ronda ${round}` : `Ronda ${round}`;
  }

  fitHeadNames();
  els.undo.disabled = state.log.length === 0;
  els.playerCount.textContent = `${players.length} / ${MAX_PLAYERS}`;
  els.addPlayer.disabled = players.length >= MAX_PLAYERS;
  els.servidaBonus.checked = state.rules.servidaBonus;
  els.servidaWins.checked = state.rules.servidaWins;
  els.reset.disabled = !hasScores();
}

// --- Events ----------------------------------------------------------------

els.undo.addEventListener('click', undoLast);
els.reset.addEventListener('click', newGame);
els.addPlayer.addEventListener('click', addPlayer);

els.servidaBonus.addEventListener('change', () => {
  state.rules.servidaBonus = els.servidaBonus.checked;
  save();
});

els.servidaWins.addEventListener('change', () => {
  state.rules.servidaWins = els.servidaWins.checked;
  save();
});

els.pickerClear.addEventListener('click', () => pick({ value: null }));
els.pickerCancel.addEventListener('click', () => els.picker.close());
els.picker.addEventListener('close', () => {
  picking = null;
});
// A tap on the dimmed backdrop closes the picker. The padding lives in .picker-body,
// so only the backdrop has the dialog itself as the target.
els.picker.addEventListener('click', (event) => {
  if (event.target === els.picker) els.picker.close();
});

// A shadow on the row names while the sheet is scrolled sideways, so the cut-off columns read as hidden.
els.sheetWrap.addEventListener(
  'scroll',
  () => {
    els.sheetWrap.classList.toggle('scrolled', els.sheetWrap.scrollLeft > 0);
  },
  { passive: true },
);

// Column widths change with the screen (rotation, split view), so check the names again.
new ResizeObserver(fitHeadNames).observe(els.sheet);

// Ask for the wake lock on the first touch, so the screen stays on from the start.
document.addEventListener('pointerdown', keepAwake, { once: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  syncFromStorage();
  if (hasScores()) keepAwake();
});

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) syncFromStorage();
});

// Offline support for the deployed site. Skipped on localhost so it never caches other local dev servers.
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

buildSheet();
buildPlayerList();
render();
