'use strict';
(() => {
  if (location.protocol === 'file:') return; // See launch.js for local launch instructions.
  const $ = id => document.getElementById(id);
  const {Board, bits, encode, select, coordinate} = Othello;
  const friends = {
    '10k': {name: 'クラゲ', art: 'jelly', number: '01', category: 'OCEAN DAYDREAMER', quote: '「考えごとも、ゆらゆらと。」', description: ['流れにまかせて、ひとつずつ。', 'はじめの一局に、ぴったりのお相手。'], caption: '約1万パラメータの、小さなAI。', alt: 'やわらかな紫色のクラゲのイラスト'},
    '1m': {name: 'ミツバチ', art: 'bee', number: '02', category: 'MEADOW EXPLORER', quote: '「ひと工夫、ひとつぶん。」', description: ['花から花へ、手から手へ。', '小さなひらめきを、集めてきました。'], caption: '約100万パラメータの、働きもの。', alt: 'まるくて黄色いミツバチのイラスト'},
    '3m': {name: 'ヤモリ', art: 'gecko', number: '03', category: 'QUIET OBSERVER', quote: '「そのすきま、見つけた。」', description: ['ぴたっと止まって、じっと観察。', '油断すると、するりとひっくり返す。'], caption: '約300万パラメータの、観察家。', alt: '指を広げた緑色のヤモリのイラスト'},
    '10m': {name: 'リクガメ', art: 'tortoise', number: '04', category: 'GENTLE STRATEGIST', quote: '「のんびり。でも、あなどらず。」', description: ['おっとりした顔で、しっかり一手。', 'じっくり向き合いたい、そんな日に。'], caption: '約1000万パラメータの、じっくり派。', alt: '緑の甲羅を持つリクガメのイラスト'},
  };
  const storageKey = 'small-brains-garden-v1';
  let manifest, tiny, tinyPromise, workerRPC, selected = '10k', activeModel = '10k', human = 0;
  let board = new Board(), turn = 0, history = [], undo = [], busy = true, generation = 0;
  let lastMessage = '', failure = '', ended = false;
  let shownResult = null;
  const states = {'10k': 'waiting', '1m': 'idle', '3m': 'idle', '10m': 'idle'};
  const downloads = new Map();
  const squares = Array.from({length: 64}, (_, i) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'square';
    button.addEventListener('click', () => humanMove(i)); $('board').append(button); return button;
  });
  const coord = i => coordinate(i).toUpperCase();
  const colors = ['黒', '白'];
  const wait = ms => new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms));

  function rpc() {
    if (workerRPC) return workerRPC;
    const worker = new Worker('model-worker.js'), pending = new Map(); let next = 0, failed = false;
    worker.onmessage = ({data}) => {
      const request = pending.get(data.id); if (!request) return;
      if (data.progress) {
        const {key, stage} = data.progress;
        states[key] = stage === 'ready' ? 'ready' : stage;
        renderSelection(); return;
      }
      pending.delete(data.id); clearTimeout(request.timer);
      if (data.error) request.reject(Error(data.error)); else request.resolve(data.result);
    };
    worker.onerror = () => {
      failed = true;
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(Error('大きい相手の準備が止まりました。クラゲとは引き続き遊べます。')); }
      pending.clear();
    };
    workerRPC = (type, payload = {}) => new Promise((resolve, reject) => {
      if (failed) { reject(Error('大きい相手を読み込むには、ページを開き直してください。')); return; }
      const id = ++next;
      const timer = setTimeout(() => { pending.delete(id); reject(Error('読み込みに時間がかかっています。少し待って、もう一度お試しください。')); }, 180000);
      pending.set(id, {resolve, reject, timer}); worker.postMessage({id, type, payload});
    });
    return workerRPC;
  }

  async function loadTiny() {
    if (tiny) return tiny;
    if (!tinyPromise) tinyPromise = TinyPolicy.load(manifest.models['10k']).then(result => {
      tiny = result; states['10k'] = 'ready'; return result;
    }).catch(error => { tinyPromise = null; states['10k'] = 'error'; throw error; });
    return tinyPromise;
  }
  async function download(key, initialize = false) {
    if (!manifest) return;
    if (key === '10k') { await loadTiny(); renderSelection(); return; }
    if (downloads.has(key)) { await downloads.get(key); if (!initialize) return; }
    if (!initialize && states[key] === 'ready') return;
    states[key] = 'downloading'; renderSelection();
    const task = rpc()(initialize ? 'prepare' : 'prefetch', {model: key}).then(() => {
      states[key] = 'ready';
    }).catch(error => { states[key] = 'error'; throw error; }).finally(() => { downloads.delete(key); renderSelection(); });
    downloads.set(key, task); return task;
  }
  function renderSelection() {
    document.querySelectorAll('.opponent-card').forEach(card => {
      const key = card.dataset.model, chosen = key === selected;
      card.classList.toggle('selected', chosen); card.setAttribute('aria-pressed', String(chosen));
      const badge = $(`status-${key}`), state = states[key];
      badge.className = 'model-status' + (state === 'ready' ? ' ready' : state === 'downloading' || state === 'initializing' ? ' loading' : '');
      badge.textContent = state === 'ready' ? key === '10k' ? 'すぐ遊べる' : '読込済み' : state === 'downloading' ? '読み込み中' : state === 'initializing' ? '準備中' : state === 'error' ? '再読込できます' : key === '3m' ? 'まもなく準備' : key === '10k' ? '準備中' : '選んで準備';
    });
    const friend = friends[selected];
    $('companion-card').className = `companion-card ${friend.art}`;
    $('companion-category').textContent = `${friend.number} / ${friend.category}`;
    $('parameter-pill').textContent = selected.toUpperCase();
    $('companion-image').src = `assets/${friend.art}.svg`; $('companion-image').alt = friend.alt;
    $('companion-quote').textContent = friend.quote; $('companion-name').textContent = friend.name;
    $('companion-description').replaceChildren(document.createTextNode(friend.description[0]), document.createElement('br'), document.createTextNode(friend.description[1]));
    $('brain-caption').textContent = friend.caption;
    const loading = ['downloading', 'initializing', 'waiting'].includes(states[selected]);
    $('start-label').textContent = loading ? `${friend.name}を準備中…` : `${friend.name}とあそぶ`;
    $('new-game').disabled = busy || !manifest || loading || states[selected] === 'error';
    $('selection-note').textContent = loading ? '準備中も、今のお相手と遊べます。' : states[selected] === 'error' ? '読み込めませんでした。もう一度お試しください。' : selected !== activeModel ? '新しい対局から、このお相手に切り替わります。' : '相手と色の変更は、新しい対局から。';
    $('selection-note').classList.toggle('error-text', states[selected] === 'error');
    $('retry-model').hidden = states[selected] !== 'error' && !(failure && selected === activeModel);
    document.querySelectorAll('[name="human-color"]').forEach(input => { input.disabled = busy; });
  }
  function absoluteCells() {
    const black = turn === 0 ? board.player : board.opponent, white = turn === 0 ? board.opponent : board.player;
    return Array.from({length: 64}, (_, i) => black & (1n << BigInt(i)) ? 1 : white & (1n << BigInt(i)) ? 2 : 0);
  }
  function render(previous = null) {
    const cells = absoluteCells(), legal = new Set(bits(board.legal)), terminal = board.terminal;
    squares.forEach((button, i) => {
      const value = cells[i], legalHere = legal.has(i) && !terminal && turn === human;
      button.className = 'square' + (legalHere ? ' legal' : '') + (history.filter(v => v >= 0).at(-1) === i ? ' last' : '') + (previous && previous[i] !== value ? ' changed' : '');
      button.disabled = busy || !tiny || terminal || turn !== human || !legal.has(i);
      const className = value === 1 ? 'stone black' : 'stone white';
      if (!value) button.replaceChildren();
      else if (button.firstElementChild?.className !== className) {
        const stone = document.createElement('span'); stone.className = className; stone.setAttribute('aria-hidden', 'true'); button.replaceChildren(stone);
      }
      button.setAttribute('aria-label', `${coord(i)} ${value ? colors[value - 1] + 'の石' : legalHere ? 'ここに置く' : '空き'}`);
    });
    const counts = [cells.filter(v => v === 1).length, cells.filter(v => v === 2).length];
    $('human-score').textContent = String(counts[human]).padStart(2, '0');
    $('opponent-score').textContent = String(counts[1 - human]).padStart(2, '0');
    $('human-stone').className = `score-stone ${human === 0 ? 'black' : 'white'}`;
    $('human-color').textContent = human === 0 ? '黒・先手' : '白・後手';
    $('opponent-color').textContent = human === 0 ? '白・後手' : '黒・先手';
    $('active-name').textContent = friends[activeModel].name; $('active-avatar').src = `assets/${friends[activeModel].art}.svg`;
    $('board').setAttribute('aria-busy', String(busy));
    $('move-count').textContent = `${history.filter(v => v >= 0).length} 手目`;
    const title = counts[human] === counts[1 - human] ? 'いい勝負。引き分けです。' : counts[human] > counts[1 - human] ? 'おみごと、あなたの勝ち！' : `${friends[activeModel].name}の勝ち！`;
    $('turn-title').textContent = failure ? 'ひと休み。もう一度お試しください。' : !tiny ? 'クラゲを起こしています…' : terminal ? title : busy ? `${friends[activeModel].name}が考えています…` : 'あなたの番です';
    document.querySelector('.turn-status').classList.toggle('thinking', busy);
    $('game-message').textContent = failure || (terminal ? '一局、おつかれさまでした。また気ままにどうぞ。' : lastMessage || `あなたは${colors[human]}。丸いしるしの場所に置けます。`);
    $('game-message').classList.toggle('error-text', !!failure);
    $('undo').disabled = busy || !undo.length;
    $('game-result').hidden = !terminal;
    if (terminal) { $('result-title').textContent = title; $('result-description').textContent = `あなた ${counts[human]} − ${counts[1 - human]} ${friends[activeModel].name}`; }
    ended = terminal; renderSelection();
    if (!terminal) {
      shownResult = null;
      if ($('result-dialog').open) $('result-dialog').close();
    } else maybeShowResult();
  }
  function maybeShowResult(force = false) {
    if (busy || failure || !board.terminal) return;
    const signature = `${generation}:${activeModel}:${human}:${history.join(',')}`;
    if ((!force && shownResult === signature) || document.querySelector('dialog[open]')) return;
    const cells = absoluteCells(), counts = [cells.filter(v => v === 1).length, cells.filter(v => v === 2).length];
    const outcome = counts[human] === counts[1 - human] ? 'draw' : counts[human] > counts[1 - human] ? 'win' : 'loss';
    const friend = friends[activeModel];
    $('result-dialog').dataset.outcome = outcome;
    $('result-avatar').src = `assets/${friend.art}.svg`;
    $('popup-result-title').textContent = $('result-title').textContent;
    $('popup-result-message').textContent = outcome === 'draw' ? 'おたがい、ゆずらず。いい勝負でした。' : outcome === 'win' ? 'いいひらめきでした。次の一局も、気ままに。' : '次はどんな一手にしよう。また気ままに、もう一局。';
    $('result-human-score').textContent = counts[human];
    $('result-ai-score').textContent = counts[1 - human];
    $('result-opponent-name').textContent = friend.name;
    $('result-human-color').textContent = colors[human];
    $('result-ai-color').textContent = colors[1 - human];
    $('result-human-stone').className = `mini-stone ${human === 0 ? 'black' : 'white'}`;
    $('result-ai-stone').className = `mini-stone ${human === 0 ? 'white' : 'black'}`;
    shownResult = signature;
    $('result-dialog').showModal();
  }
  function save() {
    if (!manifest) return;
    try { localStorage.setItem(storageKey, JSON.stringify({version: 1, model: activeModel, model_sha256: manifest.models[activeModel].sha256, human, history, undo, hints: $('hints').checked})); } catch (_) {}
  }
  function apply(action) { board = board.play(action); history.push(action); turn = 1 - turn; }
  function restoreHistory(actions) {
    let next = new Board(), nextTurn = 0;
    for (const action of actions) { next = next.play(action); nextTurn = 1 - nextTurn; }
    board = next; turn = nextTurn; history = [...actions];
  }
  async function advance(token) {
    const passes = [];
    while (!board.terminal) {
      if (!board.legal) {
        passes.push(`${turn === human ? 'あなた' : friends[activeModel].name}はパス。`);
        apply(-1); save(); continue;
      }
      if (turn === human) break;
      render(); await wait(320);
      const encoded = encode(board);
      const logits = activeModel === '10k' ? tiny.infer(encoded.features) : (await rpc()('infer', {model: activeModel, features: Array.from(encoded.features)})).logits;
      if (token !== generation) return;
      const action = select(encoded, logits), before = absoluteCells();
      apply(action); lastMessage = `${friends[activeModel].name}は ${coord(action)} に。あなたの一手をどうぞ。`;
      render(before); save();
    }
    if (passes.length) lastMessage = passes.join(' ') + (board.terminal ? '' : ' あなたの一手をどうぞ。');
  }
  async function humanMove(action) {
    if (busy || !tiny || turn !== human || board.terminal || !(board.legal & (1n << BigInt(action)))) return;
    busy = true; failure = ''; const token = generation, previous = absoluteCells();
    undo.push([...history]); apply(action); save(); render(previous);
    try { await advance(token); } catch (error) { failure = error.message; }
    finally { if (token === generation) { busy = false; render(); save(); } }
  }
  async function newGame() {
    if (busy || !manifest) return;
    const nextModel = selected, nextHuman = document.querySelector('[name="human-color"]:checked').value === 'black' ? 0 : 1;
    busy = true; failure = ''; render();
    $('turn-title').textContent = `${friends[nextModel].name}を呼んでいます…`;
    try {
      await download(nextModel, true);
      activeModel = nextModel; human = nextHuman; board = new Board(); turn = 0; history = []; undo = []; lastMessage = '';
      const token = ++generation; save(); await advance(token);
    } catch (error) { failure = error.message; }
    finally { busy = false; render(); save(); }
  }
  function askNewGame() {
    if (busy) return;
    if (history.length > 0 && !ended) $('restart-dialog').showModal(); else newGame();
  }
  document.querySelectorAll('.opponent-card').forEach(card => card.addEventListener('click', () => {
    selected = card.dataset.model; renderSelection();
    download(selected).catch(() => renderSelection());
  }));
  $('new-game').addEventListener('click', askNewGame);
  $('play-again').addEventListener('click', askNewGame);
  $('show-result').addEventListener('click', () => maybeShowResult(true));
  $('result-return').addEventListener('click', () => $('result-dialog').close());
  $('result-rematch').addEventListener('click', () => {
    selected = activeModel;
    document.querySelector(`[name="human-color"][value="${human === 0 ? 'black' : 'white'}"]`).checked = true;
    $('result-dialog').close(); newGame();
  });
  $('confirm-restart').addEventListener('click', () => { $('restart-dialog').close(); newGame(); });
  $('cancel-restart').addEventListener('click', () => $('restart-dialog').close());
  $('undo').addEventListener('click', async () => {
    if (busy || !undo.length) return;
    busy = true; failure = ''; lastMessage = 'ひとつ前に戻りました。別の一手も、試してみよう。';
    const token = ++generation; restoreHistory(undo.pop());
    try { await advance(token); } catch (error) { failure = error.message; }
    finally { busy = false; render(); save(); }
  });
  $('retry-model').addEventListener('click', () => {
    download(selected).then(async () => {
      if (selected === activeModel && turn !== human && !board.terminal) {
        busy = true; failure = ''; try { await advance(generation); } catch (error) { failure = error.message; } finally { busy = false; render(); save(); }
      }
    }).catch(() => renderSelection());
  });
  $('hints').addEventListener('change', () => { $('board').classList.toggle('hide-hints', !$('hints').checked); save(); });
  document.querySelectorAll('.howto-trigger').forEach(button => button.addEventListener('click', () => $('howto-dialog').showModal()));
  document.querySelectorAll('.dialog-close,.dialog-close-button').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  // If help was open during the last move, show the result once it is dismissed.
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => maybeShowResult()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  }));
  $('board').addEventListener('keydown', event => {
    const delta = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8}[event.key];
    if (!delta || busy) return;
    let i = squares.indexOf(document.activeElement); if (i < 0) return;
    event.preventDefault(); for (let n = 0; n < 64; n++) { i = (i + delta + 64) % 64; if (!squares[i].disabled) { squares[i].focus(); break; } }
  });
  // Read-only diagnostics also used by the local browser QA.
  window.gardenDebug = {
    state: () => ({model: activeModel, selected, human, turn, history: [...history], busy, terminal: board.terminal, failure, states: {...states}, undo: undo.map(v => [...v])}),
    diagnostics: () => workerRPC ? workerRPC('diagnostics') : Promise.resolve({created: 0, released: 0, resident: 0}),
    infer: async (model, features) => model === '10k' ? Array.from((await loadTiny()).infer(features)) : (await rpc()('infer', {model, features})).logits,
  };
  async function boot() {
    render();
    try {
      const response = await fetch('models.json'); if (!response.ok) throw Error('相手の一覧を取得できませんでした。ページを開き直してください。');
      manifest = await response.json(); await loadTiny();
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        if (saved && saved.version === 1 && friends[saved.model] && [0, 1].includes(saved.human) && saved.model_sha256 === manifest.models[saved.model].sha256 && Array.isArray(saved.history) && saved.history.length <= 128) {
          restoreHistory(saved.history); activeModel = selected = saved.model; human = saved.human;
          undo = Array.isArray(saved.undo) ? saved.undo.filter(a => Array.isArray(a) && a.length < history.length && a.every((v, i) => history[i] === v)) : [];
          $('hints').checked = saved.hints !== false; $('board').classList.toggle('hide-hints', !$('hints').checked);
          document.querySelector(`[name="human-color"][value="${human === 0 ? 'black' : 'white'}"]`).checked = true;
          if (activeModel !== '10k') await download(activeModel, true);
        }
      } catch (error) {
        if (activeModel !== '10k') throw error;
        board = new Board(); turn = 0; history = []; undo = []; human = 0;
      }
      await advance(generation); busy = false; render(); save();
      // Start only after the first lightweight game is usable; never change its opponent.
      setTimeout(() => {
        if (selected !== '10k' || activeModel !== '10k' || busy) return;
        download('3m', true).catch(() => renderSelection());
      }, 1400);
    } catch (error) { failure = error.message; busy = false; render(); }
  }
  boot();
})();
