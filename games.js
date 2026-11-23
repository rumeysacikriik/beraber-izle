let selectedSosChar = 'S';
let localSosBoard = Array(25).fill('');
let myScore = 0;
let partnerScore = 0;
let globalHighScore = { score: 120, holder: '@efsane_oyuncu' };
let secretGuessNumber = 27;

window.applyRemoteGameState = function(gState) {
  if (gState.sosBoard) {
    try { localSosBoard = JSON.parse(gState.sosBoard); renderSosBoard(); } catch (e) {}
  }
  const isHost = window.appState.myRole === 'host';
  myScore = isHost ? (gState.hostScore || 0) : (gState.guestScore || 0);
  partnerScore = isHost ? (gState.guestScore || 0) : (gState.hostScore || 0);
  document.getElementById('myGameScore').innerText = myScore;
  document.getElementById('partnerGameScore').innerText = partnerScore;

  if (gState.highScore) {
    globalHighScore = { score: gState.highScore, holder: gState.highHolder || '@oyuncu' };
    updateHighScoreUI();
  }
};

window.openSpecificGame = function(gameType) {
  document.getElementById('gamesMenuView').classList.add('hidden');
  const stage = document.getElementById('activeGameStageView');
  stage.classList.remove('hidden');
  stage.classList.add('flex');

  ['gameAreaSudoku', 'gameAreaGuess', 'gameAreaWord', 'gameAreaSos', 'gameAreaMemory', 'gameAreaHangman'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.add('hidden');
    el.classList.remove('flex');
  });

  const titles = { sudoku: 'SUDOKU (4x4)', guess: 'SAYI TAHMİNİ', word: 'KELİME TAHMİNİ', sos: 'S-O-S STRATEJİ', memory: 'HAFIZA OYUNU', hangman: 'ADAM ASMACA' };
  const targetMap = { sudoku: 'gameAreaSudoku', guess: 'gameAreaGuess', word: 'gameAreaWord', sos: 'gameAreaSos', memory: 'gameAreaMemory', hangman: 'gameAreaHangman' };

  document.getElementById('gameStatusTitle').innerText = titles[gameType] || 'Oyun';
  const activeBox = document.getElementById(targetMap[gameType]);
  if (activeBox) { activeBox.classList.remove('hidden'); activeBox.classList.add('flex'); }

  if (gameType === 'sudoku') window.resetSudokuBoard();
  if (gameType === 'word') window.newWordRound();
  if (gameType === 'memory') window.resetMemoryGame();
  if (gameType === 'hangman') window.resetHangmanGame();
};

window.backToGamesMenu = function() {
  const stage = document.getElementById('activeGameStageView');
  stage.classList.add('hidden');
  stage.classList.remove('flex');
  document.getElementById('gamesMenuView').classList.remove('hidden');
};

window.handleGamesBackBtn = function() {
  const stage = document.getElementById('activeGameStageView');
  if (!stage.classList.contains('hidden')) window.backToGamesMenu();
  else window.navigateScreen('screen-1');
};

// 1. SUDOKU
const sudokuSolution = [1, 3, 4, 2, 4, 2, 1, 3, 2, 4, 3, 1, 3, 1, 2, 4];
let sudokuCurrent = [];
const sudokuFixed = [true, false, false, true, false, true, false, false, false, false, true, false, true, false, false, true];

window.resetSudokuBoard = function() {
  sudokuCurrent = sudokuSolution.map((val, i) => sudokuFixed[i] ? val : 0);
  renderSudokuBoard();
};

function renderSudokuBoard() {
  const container = document.getElementById('sudokuGridContainer');
  if (!container) return;
  container.innerHTML = '';
  sudokuCurrent.forEach((val, idx) => {
    const btn = document.createElement('button');
    const isFixed = sudokuFixed[idx];
    btn.className = `w-11 h-11 rounded font-mono font-bold text-base flex items-center justify-center border ${isFixed ? 'bg-slate-800 text-slate-300 border-white/20' : 'bg-[#5C1013] text-white border-pink-300'}`;
    btn.innerText = val === 0 ? '' : val;
    if (!isFixed) {
      btn.onclick = () => {
        sudokuCurrent[idx] = (sudokuCurrent[idx] % 4) + 1;
        renderSudokuBoard();
        if (sudokuCurrent.every((v, i) => v === sudokuSolution[i])) {
          addPointsToMe(35);
          window.showToast('🎉 Sudoku tamamlandı! +35 Puan!');
        }
      };
    }
    container.appendChild(btn);
  });
}

// 2. SAYI TAHMİNİ
window.submitNumberGuess = function() {
  const val = parseInt(document.getElementById('guessNumberInput').value, 10);
  const hint = document.getElementById('guessHintBox');
  if (isNaN(val)) return;
  if (val === secretGuessNumber) {
    addPointsToMe(30);
    hint.innerText = `🎯 TEBRİKLER! Doğru sayı ${secretGuessNumber} idi! +30 Puan!`;
    secretGuessNumber = Math.floor(1 + Math.random() * 50);
  } else if (val < secretGuessNumber) {
    hint.innerText = `🔼 ${val} sayısından DAHA BÜYÜK bir sayı dene!`;
  } else {
    hint.innerText = `🔽 ${val} sayısından DAHA KÜÇÜK bir sayı dene!`;
  }
  document.getElementById('guessNumberInput').value = '';
};

// 3. KELİME TAHMİNİ
const wordList = ['SAHNE', 'EKRAN', 'OYUNU', 'ROKET', 'KAHVE', 'MÜZİK', 'FİLMİ'];
let targetWord = 'SAHNE';

window.newWordRound = function() {
  targetWord = wordList[Math.floor(Math.random() * wordList.length)];
  renderWordBoxes('');
};

function renderWordBoxes(guessStr) {
  const area = document.getElementById('wordBoxesArea');
  if (!area) return;
  area.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const ch = guessStr[i] || '';
    let bg = 'bg-black/50 border-white/30 text-white';
    if (ch) {
      if (ch === targetWord[i]) bg = 'bg-emerald-500 border-emerald-300 text-black';
      else if (targetWord.includes(ch)) bg = 'bg-amber-400 border-amber-200 text-black';
      else bg = 'bg-slate-700 border-white/20 text-white';
    }
    const box = document.createElement('div');
    box.className = `w-10 h-11 border-2 rounded flex items-center justify-center font-bold text-base ${bg}`;
    box.innerText = ch;
    area.appendChild(box);
  }
}

window.submitWordGuess = function() {
  const input = document.getElementById('wordGuessInput');
  const val = input.value.trim().toUpperCase();
  if (val.length !== 5) { window.showToast('Lütfen 5 harfli bir kelime girin!'); return; }
  renderWordBoxes(val);
  input.value = '';
  if (val === targetWord) {
    addPointsToMe(25);
    document.getElementById('wordHintText').innerText = `🎉 Harika! "${targetWord}" kelimesini buldun! +25 Puan!`;
  }
};

// 4. SOS
window.selectSosLetter = function(ch) {
  selectedSosChar = ch;
  document.getElementById('pickBtnS').className = ch === 'S' ? 'w-11 h-11 rounded-lg bg-[#5C1013] border-2 border-white font-bold text-lg' : 'w-11 h-11 rounded-lg bg-slate-800 border border-white/30 font-bold text-lg';
  document.getElementById('pickBtnO').className = ch === 'O' ? 'w-11 h-11 rounded-lg bg-[#5C1013] border-2 border-white font-bold text-lg' : 'w-11 h-11 rounded-lg bg-slate-800 border border-white/30 font-bold text-lg';
};

function renderSosBoard() {
  const container = document.getElementById('sosGridContainer');
  if (!container) return;
  container.innerHTML = '';
  localSosBoard.forEach((val, idx) => {
    const btn = document.createElement('button');
    btn.className = 'w-10 h-10 rounded bg-[#1e293b] hover:bg-[#334155] border border-white/20 font-mono font-bold text-base text-white flex items-center justify-center';
    btn.innerText = val;
    btn.onclick = () => makeSosMove(idx);
    container.appendChild(btn);
  });
}
renderSosBoard();

function makeSosMove(index) {
  if (localSosBoard[index] !== '') return;
  localSosBoard[index] = selectedSosChar;
  const gained = checkSosFormed(index);
  if (gained > 0) { addPointsToMe(gained * 15); window.showToast(`🎉 S-O-S Yaptın! +${gained * 15} Puan!`); }
  renderSosBoard();
  syncGameStateToCloud();
}

function checkSosFormed(idx) {
  const r = Math.floor(idx / 5); const c = idx % 5;
  const g = (row, col) => (row >= 0 && row < 5 && col >= 0 && col < 5) ? localSosBoard[row * 5 + col] : '';
  let count = 0; const dirs = [[0,1], [1,0], [1,1], [1,-1]];
  if (localSosBoard[idx] === 'O') {
    dirs.forEach(([dr, dc]) => { if (g(r - dr, c - dc) === 'S' && g(r + dr, c + dc) === 'S') count++; });
  } else if (localSosBoard[idx] === 'S') {
    dirs.forEach(([dr, dc]) => {
      if (g(r + dr, c + dc) === 'O' && g(r + 2*dr, c + 2*dc) === 'S') count++;
      if (g(r - dr, c - dc) === 'O' && g(r - 2*dr, c - 2*dc) === 'S') count++;
    });
  }
  return count;
}

window.resetSosBoard = function() { localSosBoard = Array(25).fill(''); renderSosBoard(); syncGameStateToCloud(); };

// 5. HAFIZA OYUNU
let memoryCards = [];
let flippedIndices = [];
let matchedMask = [];

window.resetMemoryGame = function() {
  const icons = ['🎬', '🍿', '🎧', '🎮', '🎬', '🍿', '🎧', '🎮'];
  memoryCards = icons.sort(() => Math.random() - 0.5);
  flippedIndices = [];
  matchedMask = Array(8).fill(false);
  renderMemoryGrid();
};

function renderMemoryGrid() {
  const grid = document.getElementById('memoryGridContainer');
  if (!grid) return;
  grid.innerHTML = '';
  memoryCards.forEach((icon, idx) => {
    const isOpen = flippedIndices.includes(idx) || matchedMask[idx];
    const btn = document.createElement('button');
    btn.className = `w-14 h-16 rounded-lg border-2 font-bold text-xl flex items-center justify-center ${isOpen ? 'bg-[#5C1013] border-pink-300 text-white' : 'bg-[#151D2B] border-white text-white'}`;
    btn.innerText = isOpen ? icon : '★';
    btn.onclick = () => flipMemoryCard(idx);
    grid.appendChild(btn);
  });
}

function flipMemoryCard(idx) {
  if (flippedIndices.length >= 2 || flippedIndices.includes(idx) || matchedMask[idx]) return;
  flippedIndices.push(idx);
  renderMemoryGrid();
  if (flippedIndices.length === 2) {
    const [a, b] = flippedIndices;
    if (memoryCards[a] === memoryCards[b]) {
      matchedMask[a] = true; matchedMask[b] = true; flippedIndices = [];
      addPointsToMe(15); renderMemoryGrid();
    } else {
      setTimeout(() => { flippedIndices = []; renderMemoryGrid(); }, 700);
    }
  }
}

// 6. ADAM ASMACA
const hangmanWords = ['SİNEMA', 'KADİFE', 'KONSER', 'OYUNCU', 'EKRAN'];
let hmWord = 'SİNEMA';
let hmGuessed = [];
let hmMistakes = 0;

window.resetHangmanGame = function() {
  hmWord = hangmanWords[Math.floor(Math.random() * hangmanWords.length)];
  hmGuessed = []; hmMistakes = 0;
  for (let i = 1; i <= 6; i++) document.getElementById('hmPart' + i)?.classList.add('hidden');
  renderHangmanState();
};

function renderHangmanState() {
  const disp = document.getElementById('hangmanWordDisplay');
  if (!disp) return;
  disp.innerText = hmWord.split('').map(ch => hmGuessed.includes(ch) ? ch : '_').join(' ');

  const kb = document.getElementById('hangmanKeyboard');
  kb.innerHTML = '';
  'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'.split('').slice(0, 24).forEach(ch => {
    const used = hmGuessed.includes(ch);
    const b = document.createElement('button');
    b.className = `px-2 py-1 rounded text-xs font-bold border ${used ? 'bg-slate-800 text-slate-500 border-white/10' : 'bg-[#5C1013] text-white border-pink-300/60'}`;
    b.innerText = ch; b.disabled = used;
    b.onclick = () => {
      hmGuessed.push(ch);
      if (!hmWord.includes(ch)) {
        hmMistakes = Math.min(6, hmMistakes + 1);
        document.getElementById('hmPart' + hmMistakes)?.classList.remove('hidden');
        if (hmMistakes >= 6) { window.showToast(`💀 Kelime: ${hmWord}`); setTimeout(window.resetHangmanGame, 1400); }
      } else if (hmWord.split('').every(c => hmGuessed.includes(c))) {
        addPointsToMe(25); window.showToast(`🎉 Bildin: ${hmWord}! +25 Puan!`);
      }
      renderHangmanState();
    };
    kb.appendChild(b);
  });
}

function addPointsToMe(pts) {
  myScore += pts;
  document.getElementById('myGameScore').innerText = myScore;
  if (myScore > globalHighScore.score) {
    globalHighScore = { score: myScore, holder: '@' + window.myProfile.username };
    updateHighScoreUI();
  }
  syncGameStateToCloud();
}

function updateHighScoreUI() {
  const text = `🌟 Yüksek skor: <b>${globalHighScore.score} Puan</b> (${globalHighScore.holder})`;
  const modalBox = document.getElementById('modalHighScoreBox');
  if (modalBox) modalBox.innerHTML = text;
}

function syncGameStateToCloud() {
  const isHost = window.appState.myRole === 'host';
  window.saveRoomStateToCloud({
    gameState: {
      sosBoard: JSON.stringify(localSosBoard),
      hostScore: isHost ? myScore : partnerScore,
      guestScore: !isHost ? myScore : partnerScore,
      highScore: globalHighScore.score,
      highHolder: globalHighScore.holder
    }
  });
}

window.showScoreComparisonModal = function() {
  document.getElementById('modalMyScore').innerText = myScore + ' Puan';
  document.getElementById('modalPartnerScore').innerText = partnerScore + ' Puan';
  updateHighScoreUI();
  document.getElementById('scoreResultModal').classList.add('show');
};