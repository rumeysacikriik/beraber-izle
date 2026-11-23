import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA332XxIW4shaAc2F3VnH7k5Q9aj6z5Q1A",
  authDomain: "beraber-izlemek.firebaseapp.com",
  databaseURL: "https://beraber-izlemek-default-rtdb.firebaseio.com",
  projectId: "beraber-izlemek",
  storageBucket: "beraber-izlemek.firebasestorage.app",
  messagingSenderId: "83126717288",
  appId: "1:83126717288:web:e0f973b207ba2313e464dd"
};

const app = initializeApp(firebaseConfig);
window.auth = getAuth(app);
window.db = getFirestore(app);
window.currentUser = null;
window.appId = 'beraber-izle-oyna-app';

// Ortak Durum (Diğer JS dosyaları buradan erişir)
window.appState = {
  currentRoomCode: null,
  myRole: 'host',
  lastKnownVideoTimestamp: 0,
  localMemories: [{ title: 'İlk Beraber İzleme', note: 'Senkronize sinema odamız hazır!', author: 'Sistem' }],
  localChatList: [{ sender: 'Sistem', text: 'Odaya hoş geldiniz! İyi seyirler.' }]
};

window.myProfile = {
  username: 'Oyuncu_' + Math.floor(100 + Math.random() * 899),
  gender: 'girl',
  skin: '#F5CBA7',
  hair: '#4A2311',
  eye: '#2E86C1'
};

let roomUnsubscribe = null;
const localTabChannel = new BroadcastChannel('beraber_izle_sync_channel');
localTabChannel.onmessage = (ev) => {
  if (ev.data && ev.data.roomCode === window.appState.currentRoomCode) {
    window.applyRoomSnapshotData(ev.data.payload);
  }
};

window.refreshMyProfileUI = function() {
  document.getElementById('myWalkerTag').innerText = window.myProfile.username;
  document.getElementById('drawerUsernameText').innerText = '@' + window.myProfile.username;
  document.querySelectorAll('#myAvatarSvg .my-skin').forEach(el => el.setAttribute('fill', window.myProfile.skin));
  document.querySelector('#myAvatarSvg .my-hair').setAttribute('fill', window.myProfile.hair);
  document.querySelectorAll('#myAvatarSvg .my-eye').forEach(el => el.setAttribute('fill', window.myProfile.eye));

  const hairPath = document.getElementById('myHairShape');
  if (window.myProfile.gender === 'girl') {
    hairPath.setAttribute('d', 'M12,26 C12,10 48,10 48,26 C50,36 46,44 43,40 C42,22 18,22 17,40 C14,44 10,36 12,26 Z');
  } else {
    hairPath.setAttribute('d', 'M14,22 C14,10 46,10 46,22 C44,16 16,16 14,22 Z');
  }
};
window.refreshMyProfileUI();

async function initCloudSystem() {
  try {
    await signInAnonymously(window.auth);
    onAuthStateChanged(window.auth, (user) => {
      if (user) window.currentUser = user;
    });
  } catch (err) {
    console.error('Firebase bağlantı hatası:', err);
  }
}
initCloudSystem();

window.navigateScreen = function(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
  if (screenId === 'screen-games' && window.backToGamesMenu) {
    window.backToGamesMenu();
  }
};

window.toggleDrawer = function(open) {
  const drawer = document.getElementById('sideDrawer');
  const lobby = document.getElementById('lobbyWrapper');
  if (open) {
    window.navigateScreen('screen-1');
    drawer.classList.add('open');
    lobby.classList.add('blurred');
  } else {
    drawer.classList.remove('open');
    lobby.classList.remove('blurred');
  }
};

window.handleModeButtonClick = function(mode) {
  if (!window.appState.currentRoomCode) {
    window.pendingTargetMode = mode;
    window.navigateScreen('screen-3');
  } else {
    if (mode === 'watch') window.navigateScreen('screen-8');
    if (mode === 'games') window.navigateScreen('screen-games');
  }
};

window.showToast = function(msg) {
  const t = document.getElementById('toastBanner');
  t.innerText = msg;
  t.style.display = 'block';
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => { t.style.display = 'none'; }, 3200);
};

window.closeAllModals = function() {
  document.querySelectorAll('.custom-modal').forEach(m => m.classList.remove('show'));
};
window.openJoinModal = function() { window.closeAllModals(); document.getElementById('joinRoomModal').classList.add('show'); };
window.openCharacterModal = function() { window.closeAllModals(); document.getElementById('characterModal').classList.add('show'); };

window.saveRoomStateToCloud = async function(partialOrFullData) {
  const code = window.appState.currentRoomCode;
  if (!code) return;
  localTabChannel.postMessage({ roomCode: code, payload: partialOrFullData });
  if (!window.db || !window.currentUser) return;
  try {
    const roomRef = doc(window.db, 'artifacts', window.appId, 'public', 'data', 'rooms', code);
    await setDoc(roomRef, partialOrFullData, { merge: true });
  } catch (err) { console.warn('Firestore yazma hatası:', err); }
};

function subscribeToRoomRealtime(code) {
  if (roomUnsubscribe) roomUnsubscribe();
  if (!window.db || !window.currentUser) return;
  const roomRef = doc(window.db, 'artifacts', window.appId, 'public', 'data', 'rooms', code);
  roomUnsubscribe = onSnapshot(roomRef, (snap) => {
    if (snap.exists()) window.applyRoomSnapshotData(snap.data());
  });
}

window.createNewRoom = async function() {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  window.appState.currentRoomCode = code;
  window.appState.myRole = 'host';

  document.getElementById('generatedCodeDisplay').innerText = code;
  window.navigateScreen('screen-4');
  updateRoomHeaderPill();

  const initialRoomData = {
    roomCode: code,
    hostProfile: window.myProfile,
    guestProfile: null,
    videoState: { url: '', isPlaying: false, currentTime: 0, updatedAt: Date.now(), updatedBy: window.myProfile.username },
    chatMessages: [{ sender: 'Sistem', text: `Oda #${code} kuruldu!` }],
    gameState: { sosBoard: JSON.stringify(Array(25).fill('')), hostScore: 0, guestScore: 0, highScore: 120, highHolder: '@efsane_oyuncu' },
    memories: [{ title: 'Odamız Kuruldu', note: `Oda #${code} ile ilk buluşmamız!`, author: window.myProfile.username }]
  };

  await window.saveRoomStateToCloud(initialRoomData);
  subscribeToRoomRealtime(code);
  window.showToast(`Oda #${code} başarıyla oluşturuldu!`);
};

window.copyRoomCodeAction = function() {
  const code = document.getElementById('generatedCodeDisplay').innerText;
  navigator.clipboard?.writeText(code);
  window.showToast(`Oda numarası (${code}) kopyalandı!`);
};

window.proceedAfterRoomCreated = function() {
  if (window.pendingTargetMode === 'games') window.navigateScreen('screen-games');
  else window.navigateScreen('screen-8');
};

window.joinRoomFromInput = async function() {
  const code = document.getElementById('joinCodeInput').value.trim();
  if (code.length < 4) { window.showToast('Lütfen geçerli bir oda numarası girin!'); return; }
  await window.joinRoomByCode(code);
  window.closeAllModals();
};

window.joinRoomByCode = async function(code) {
  window.appState.currentRoomCode = code;
  window.appState.myRole = 'guest';
  updateRoomHeaderPill();
  document.getElementById('partnerWalker').style.display = 'flex';

  if (window.db && window.currentUser) {
    try {
      const roomRef = doc(window.db, 'artifacts', window.appId, 'public', 'data', 'rooms', code);
      const snap = await getDoc(roomRef);
      if (snap.exists()) {
        const data = snap.data();
        const updatedChats = [...(data.chatMessages || []), { sender: 'Sistem', text: `${window.myProfile.username} odaya katıldı!` }];
        await updateDoc(roomRef, { guestProfile: window.myProfile, chatMessages: updatedChats });
      }
    } catch (e) { console.warn(e); }
  }

  subscribeToRoomRealtime(code);
  localTabChannel.postMessage({ roomCode: code, payload: { guestProfile: window.myProfile } });
  window.navigateScreen('screen-1');
  window.showToast(`#${code} numaralı odaya katıldın!`);
};

window.leaveCurrentRoom = function() {
  if (roomUnsubscribe) roomUnsubscribe();
  window.appState.currentRoomCode = null;
  document.getElementById('partnerWalker').style.display = 'none';
  updateRoomHeaderPill();
  window.navigateScreen('screen-1');
  window.showToast('Odadan çıkış yapıldı.');
};

function updateRoomHeaderPill() {
  const dot = document.getElementById('roomStatusDot');
  const txt = document.getElementById('roomStatusText');
  if (window.appState.currentRoomCode) {
    dot.classList.add('connected');
    txt.innerText = `Oda: #${window.appState.currentRoomCode} (Bağlı)`;
  } else {
    dot.classList.remove('connected');
    txt.innerText = 'Tek Başına (Oda Yok)';
  }
}

window.applyRoomSnapshotData = function(data) {
  if (!data) return;

  const partner = window.appState.myRole === 'host' ? data.guestProfile : data.hostProfile;
  if (partner && partner.username) {
    document.getElementById('partnerWalker').style.display = 'flex';
    document.getElementById('partnerWalkerTag').innerText = partner.username;
    document.getElementById('waitingPartnerText').innerText = `🟢 ${partner.username} odaya katıldı!`;

    document.querySelectorAll('#partnerAvatarSvg .p-skin').forEach(el => el.setAttribute('fill', partner.skin || '#F5CBA7'));
    document.querySelector('#partnerAvatarSvg .p-hair').setAttribute('fill', partner.hair || '#1C2833');
    document.querySelectorAll('#partnerAvatarSvg .p-eye').forEach(el => el.setAttribute('fill', partner.eye || '#27AE60'));
    const pHair = document.getElementById('partnerHairShape');
    pHair.setAttribute('d', partner.gender === 'girl'
      ? 'M12,26 C12,10 48,10 48,26 C50,36 46,44 43,40 C42,22 18,22 17,40 C14,44 10,36 12,26 Z'
      : 'M14,22 C14,10 46,10 46,22 C44,16 16,16 14,22 Z');
  }

  if (data.videoState && data.videoState.updatedAt > window.appState.lastKnownVideoTimestamp) {
    window.appState.lastKnownVideoTimestamp = data.videoState.updatedAt;
    if (window.syncLocalVideoPlayerWithRemote) window.syncLocalVideoPlayerWithRemote(data.videoState);
  }

  if (Array.isArray(data.chatMessages)) renderChatMessages(data.chatMessages);
  if (data.gameState && window.applyRemoteGameState) window.applyRemoteGameState(data.gameState);
  if (Array.isArray(data.memories)) renderMemoriesList(data.memories);
};

window.sendRoomChatMessage = function() {
  const input = document.getElementById('chatInputBox');
  const text = input.value.trim();
  if (!text) return;
  window.appState.localChatList.push({ sender: window.myProfile.username, text });
  renderChatMessages(window.appState.localChatList);
  input.value = '';
  window.saveRoomStateToCloud({ chatMessages: window.appState.localChatList });
};

function renderChatMessages(messages) {
  window.appState.localChatList = messages;
  const area = document.getElementById('chatMessagesArea');
  if (!area) return;
  area.innerHTML = '';
  messages.forEach(m => {
    const div = document.createElement('div');
    div.className = 'chat-msg-item' + (m.sender === window.myProfile.username ? ' mine' : '');
    div.innerHTML = `<b>${m.sender}:</b> ${m.text}`;
    area.appendChild(div);
  });
  area.scrollTop = area.scrollHeight;
}
renderChatMessages(window.appState.localChatList);

window.updateMyAvatarConfig = function(key, val) {
  window.myProfile[key] = val;
  if (key === 'gender') {
    document.getElementById('btnGenderGirl').className = val === 'girl' ? 'px-3 py-1 rounded bg-[#5C1013] border border-white' : 'px-3 py-1 rounded bg-black/40 border border-white/20';
    document.getElementById('btnGenderBoy').className = val === 'boy' ? 'px-3 py-1 rounded bg-[#5C1013] border border-white' : 'px-3 py-1 rounded bg-black/40 border border-white/20';
  }
  window.refreshMyProfileUI();
  if (window.appState.currentRoomCode) {
    const payload = window.appState.myRole === 'host' ? { hostProfile: window.myProfile } : { guestProfile: window.myProfile };
    window.saveRoomStateToCloud(payload);
  }
};

window.saveUsernameChange = function() {
  const newName = document.getElementById('newUsernameInput').value.trim();
  if (!newName) { window.showToast('Lütfen yeni kullanıcı adını giriniz!'); return; }
  window.myProfile.username = newName;
  window.refreshMyProfileUI();
  document.getElementById('newUsernameInput').value = '';
  window.showToast(`Kullanıcı adın @${newName} olarak güncellendi!`);
};

window.handleProfilePhotoUpload = function(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('drawerUserBadge').innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover" alt="Profil">`;
    window.showToast('Profil fotoğrafın yüklendi!');
  };
  reader.readAsDataURL(file);
};

window.toggleThemeMode = function() { document.getElementById('stageWrapper').classList.toggle('theme-light'); window.showToast('Tema değiştirildi!'); };
window.freezeAccountPrompt = function() { window.showToast('❄️ Hesabın geçici olarak donduruldu.'); window.navigateScreen('screen-1'); };

window.searchRoomsOrUsers = function() {
  const q = document.getElementById('searchRoomOrUserInput').value.trim(); if (!q) return;
  if (/^\d{4,6}$/.test(q)) window.joinRoomByCode(q);
  else {
    const list = document.getElementById('searchResultsList');
    const row = document.createElement('div'); row.className = 'lined-row';
    row.innerHTML = `<span>@${q} (Odaya Çağır)</span><button class="row-icon-btn" onclick="window.createNewRoom()">+</button>`;
    list.prepend(row);
  }
};

function renderMemoriesList(list) {
  window.appState.localMemories = list;
  const container = document.getElementById('memoriesListContainer');
  if (!container) return;
  container.innerHTML = '';
  list.forEach(item => {
    const card = document.createElement('div');
    card.className = 'bg-[#5C1013]/80 p-2.5 rounded-lg border border-pink-300/30 flex flex-col justify-between';
    card.innerHTML = `<div><div class="font-bold text-xs text-pink-200 mb-1">${item.title}</div><p class="text-[11px] text-slate-200">${item.note}</p></div><div class="text-[10px] text-amber-300 mt-2 text-right">— ${item.author}</div>`;
    container.appendChild(card);
  });
}
renderMemoriesList(window.appState.localMemories);

window.addSharedMemory = function() {
  const title = document.getElementById('memoryTitleInput').value.trim();
  const note = document.getElementById('memoryNoteInput').value.trim();
  if (!title || !note) { window.showToast('Lütfen başlık ve not yazın!'); return; }
  window.appState.localMemories.unshift({ title, note, author: window.myProfile.username });
  renderMemoriesList(window.appState.localMemories);
  document.getElementById('memoryTitleInput').value = '';
  document.getElementById('memoryNoteInput').value = '';
  window.saveRoomStateToCloud({ memories: window.appState.localMemories });
  window.showToast('💌 Anı kutusuna kaydedildi!');
};