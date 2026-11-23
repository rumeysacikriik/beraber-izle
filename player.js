let currentLoadedUrl = '';
let isApplyingRemoteVideo = false;
let localAudioStream = null;
let isMicOpen = false;

let ytApiPlayer = null;
let isYtApiReady = false;
let pendingYtState = null;

// Python sunucusunun çalışıp çalışmadığını otomatik test edeceğiz
let isPythonServerActive = false;
const PYTHON_RESOLVER_API = 'http://127.0.0.1:5000/extract';

const html5Video = document.getElementById('html5VideoPlayer');
const ytContainer = document.getElementById('youtubePlayerContainer');

// 1. Python Sunucusunun Aktif Olup Olmadığını Arka Planda Test Et
async function checkPythonServer() {
  try {
    const res = await fetch('http://127.0.0.1:5000/', { method: 'GET', mode: 'cors' });
    isPythonServerActive = res.ok;
  } catch (e) {
    isPythonServerActive = false; // Telefon veya Netlify üzerindeyken buraya düşer ve Python'suz moda geçer
  }
}
checkPythonServer();

// 2. Bilgisayardan Dosya Seçme Butonunu Otomatik Ekle
(function injectLocalFileButton() {
  const urlBar = document.querySelector('.watch-url-bar');
  if (!urlBar || document.getElementById('localFilePickerBtn')) return;

  const fileLabel = document.createElement('label');
  fileLabel.id = 'localFilePickerBtn';
  fileLabel.className = 'url-start-btn';
  fileLabel.style.background = '#059669';
  fileLabel.style.borderColor = '#6ee7b7';
  fileLabel.style.cursor = 'pointer';
  fileLabel.title = 'Bilgisayarındaki bir MP4/MKV video dosyasını seçip senkronize izle';
  fileLabel.innerHTML = `
    <span>📁 Dosya</span>
    <input type="file" accept="video/*,.mkv" class="hidden" onchange="window.handleLocalVideoSelect(event)">
  `;
  urlBar.appendChild(fileLabel);
})();

window.handleLocalVideoSelect = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const blobUrl = URL.createObjectURL(file);

  if (ytApiPlayer && typeof ytApiPlayer.pauseVideo === 'function') {
    try { ytApiPlayer.pauseVideo(); } catch (e) {}
  }
  ytContainer.classList.add('hidden');
  document.getElementById('videoEmptyPlaceholder').classList.add('hidden');
  html5Video.classList.remove('hidden');

  currentLoadedUrl = 'local:' + file.name;
  html5Video.src = blobUrl;
  html5Video.play().catch(() => {});

  document.getElementById('videoUrlInput').value = `[Yerel Dosya] ${file.name}`;
  window.showToast(`🎬 "${file.name}" yüklendi!`);
  broadcastVideoAction(true, 0);
};

// 3. YouTube IFrame API Yükleyici
(function loadYouTubeApi() {
  if (window.YT && window.YT.Player) {
    isYtApiReady = true;
    return;
  }
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
})();

window.onYouTubeIframeAPIReady = function() {
  isYtApiReady = true;
  if (pendingYtState) {
    applyVideoRouting(pendingYtState);
    pendingYtState = null;
  }
};

function extractYouTubeId(url) {
  if (!url || url.startsWith('local:')) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.slice(1, 12);
    if (parsed.searchParams.get('v')) return parsed.searchParams.get('v').slice(0, 11);
    const pathMatch = parsed.pathname.match(/\/(embed|v|shorts|live)\/([^/?#&]+)/);
    if (pathMatch && pathMatch[2]) return pathMatch[2].slice(0, 11);
  } catch (e) {}
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

window.quickLoadSample = function(sampleUrl) {
  document.getElementById('videoUrlInput').value = sampleUrl;
  window.loadAndSyncVideoFromInput();
};

window.loadAndSyncVideoFromInput = async function() {
  const rawInput = document.getElementById('videoUrlInput').value.trim();
  if (!rawInput) {
    window.showToast('Lütfen bir video linki yapıştırın!');
    return;
  }

  let finalUrl = rawInput;
  let streamType = 'mp4';

  // Eğer bilgisayarda Python sunucusu (`server.py`) aktifse, zorlu YouTube/video linklerini Python ile çöz:
  if (isPythonServerActive && !/\.(mp4|webm|ogg|m3u8)(\?.*)?$/i.test(rawInput) && !extractYouTubeId(rawInput)) {
    try {
      document.getElementById('videoSyncStatusText').innerText = '⏳ Python Akışı Çözüyor...';
      const response = await fetch(`${PYTHON_RESOLVER_API}?url=${encodeURIComponent(rawInput)}`);
      const data = await response.json();
      if (response.ok && data.success && data.streamUrl) {
        finalUrl = data.streamUrl;
        streamType = data.type || 'mp4';
      }
    } catch (e) {}
  }

  const newState = {
    url: finalUrl,
    originalUrl: rawInput,
    streamType: streamType,
    isPlaying: true,
    currentTime: 0,
    updatedAt: Date.now(),
    updatedBy: window.myProfile.username
  };

  window.appState.lastKnownVideoTimestamp = newState.updatedAt;
  window.syncLocalVideoPlayerWithRemote(newState);
  window.saveRoomStateToCloud({ videoState: newState });
};

// Hibrit Yönlendirici: Gelen linkin türüne göre (YouTube API, HTML5 Video veya Yerel Dosya) en uygun oynatıcıyı seçer
window.syncLocalVideoPlayerWithRemote = function(vState) {
  if (!vState || !vState.url) return;
  isApplyingRemoteVideo = true;

  document.getElementById('videoEmptyPlaceholder').classList.add('hidden');
  if (vState.originalUrl) {
    document.getElementById('videoUrlInput').value = vState.originalUrl;
  }
  document.getElementById('videoSyncStatusText').innerText = 
    `${vState.updatedBy || 'Oda'} ${vState.isPlaying ? '▶ oynatıyor' : '⏸ durdurdu'} (${Math.floor(vState.currentTime || 0)}. sn)`;

  const cleanUrl = vState.url.trim();
  const ytId = extractYouTubeId(vState.originalUrl || cleanUrl);
  const isHls = vState.streamType === 'hls' || /\.m3u8(\?.*)?$/i.test(cleanUrl);

  // 1. Yerel Dosya Senkronizasyonu
  if (cleanUrl.startsWith('local:')) {
    const targetTime = vState.currentTime || 0;
    if (Math.abs(html5Video.currentTime - targetTime) > 1.5) {
      html5Video.currentTime = targetTime;
    }
    if (vState.isPlaying) html5Video.play().catch(() => {});
    else html5Video.pause();
    setTimeout(() => { isApplyingRemoteVideo = false; }, 500);
    return;
  }

  // 2. YouTube Linki (Python yoksa veya Netlify/telefondaysa resmi YouTube API ile açılır)
  if (ytId && !isPythonServerActive) {
    html5Video.pause();
    html5Video.classList.add('hidden');
    ytContainer.classList.remove('hidden');

    if (isYtApiReady && window.YT && window.YT.Player) {
      applyYouTubePlayerSync(vState, ytId);
    } else {
      pendingYtState = vState;
    }
    setTimeout(() => { isApplyingRemoteVideo = false; }, 700);
    return;
  }

  // 3. Doğrudan MP4 / M3U8 veya Python Tarafından Çözülmüş Akış (%100 Senkronize HTML5 Oynatıcı)
  if (ytApiPlayer && typeof ytApiPlayer.pauseVideo === 'function') {
    try { ytApiPlayer.pauseVideo(); } catch (e) {}
  }
  ytContainer.classList.add('hidden');
  html5Video.classList.remove('hidden');

  if (currentLoadedUrl !== cleanUrl) {
    currentLoadedUrl = cleanUrl;
    if (isHls && window.Hls && Hls.isSupported()) {
      if (window.currentHls) window.currentHls.destroy();
      window.currentHls = new Hls();
      window.currentHls.loadSource(cleanUrl);
      window.currentHls.attachMedia(html5Video);
    } else {
      html5Video.src = cleanUrl;
    }
  }

  const targetTime = vState.currentTime || 0;
  if (Math.abs(html5Video.currentTime - targetTime) > 1.5) {
    html5Video.currentTime = targetTime;
  }

  if (vState.isPlaying) {
    html5Video.play().catch(() => {});
  } else {
    html5Video.pause();
  }

  setTimeout(() => { isApplyingRemoteVideo = false; }, 700);
};

function applyYouTubePlayerSync(vState, ytId) {
  const targetTime = Math.floor(vState.currentTime || 0);

  if (!ytApiPlayer || currentLoadedUrl !== vState.url) {
    currentLoadedUrl = vState.url;
    ytContainer.innerHTML = '<div id="ytControlledPlayer" class="w-full h-full"></div>';

    const pVars = {
      playsinline: 1,
      rel: 0,
      autoplay: vState.isPlaying ? 1 : 0,
      start: targetTime
    };
    if (window.location.protocol.startsWith('http')) {
      pVars.origin = window.location.origin;
    }

    ytApiPlayer = new YT.Player('ytControlledPlayer', {
      width: '100%',
      height: '100%',
      videoId: ytId,
      playerVars: pVars,
      events: {
        onReady: (ev) => {
          if (vState.isPlaying) ev.target.playVideo();
          else ev.target.pauseVideo();
        },
        onStateChange: (event) => {
          if (isApplyingRemoteVideo || !currentLoadedUrl) return;
          const curTime = ytApiPlayer.getCurrentTime ? ytApiPlayer.getCurrentTime() : 0;
          if (event.data === YT.PlayerState.PLAYING) {
            broadcastVideoAction(true, curTime);
          } else if (event.data === YT.PlayerState.PAUSED) {
            broadcastVideoAction(false, curTime);
          }
        }
      }
    });
    return;
  }

  if (typeof ytApiPlayer.getCurrentTime === 'function') {
    const currentYtTime = ytApiPlayer.getCurrentTime() || 0;
    if (Math.abs(currentYtTime - targetTime) > 2) {
      ytApiPlayer.seekTo(targetTime, true);
    }
    if (vState.isPlaying) ytApiPlayer.playVideo();
    else ytApiPlayer.pauseVideo();
  }
}

// HTML5 Video Oynatıcı Kontrolleri (Durdur, Başlat, Sar)
html5Video.addEventListener('play', () => {
  if (isApplyingRemoteVideo || !currentLoadedUrl) return;
  broadcastVideoAction(true, html5Video.currentTime);
});

html5Video.addEventListener('pause', () => {
  if (isApplyingRemoteVideo || !currentLoadedUrl) return;
  broadcastVideoAction(false, html5Video.currentTime);
});

html5Video.addEventListener('seeked', () => {
  if (isApplyingRemoteVideo || !currentLoadedUrl) return;
  broadcastVideoAction(!html5Video.paused, html5Video.currentTime);
});

function broadcastVideoAction(isPlaying, currentTime) {
  const rawUrl = currentLoadedUrl.startsWith('local:') 
    ? currentLoadedUrl 
    : (document.getElementById('videoUrlInput').value.trim() || currentLoadedUrl);

  const vState = {
    url: currentLoadedUrl,
    originalUrl: document.getElementById('videoUrlInput').value.trim(),
    streamType: currentLoadedUrl.includes('.m3u8') ? 'hls' : 'mp4',
    isPlaying: isPlaying,
    currentTime: currentTime || 0,
    updatedAt: Date.now(),
    updatedBy: window.myProfile.username
  };
  window.appState.lastKnownVideoTimestamp = vState.updatedAt;
  document.getElementById('videoSyncStatusText').innerText = 
    `Sen ${isPlaying ? '▶ başlattın' : '⏸ durdurdun'} (${Math.floor(currentTime)}sn)`;
  window.saveRoomStateToCloud({ videoState: vState });
}

window.manualSyncPlayPause = function() {
  if (!html5Video.classList.contains('hidden')) {
    if (html5Video.paused) html5Video.play();
    else html5Video.pause();
  } else if (ytApiPlayer && typeof ytApiPlayer.getPlayerState === 'function') {
    const state = ytApiPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) ytApiPlayer.pauseVideo();
    else ytApiPlayer.playVideo();
  }
};

window.toggleVideoFullscreen = function() {
  const box = document.getElementById('videoPlayerBox');
  if (!document.fullscreenElement) box.requestFullscreen?.();
  else document.exitFullscreen?.();
};

window.toggleVoiceMic = async function() {
  const btn = document.getElementById('micToggleBtn');
  const label = document.getElementById('micLabelSpan');
  if (!isMicOpen) {
    try {
      localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      isMicOpen = true; btn.classList.add('mic-active'); label.innerText = 'Ses İletiliyor (Açık)';
      window.showToast('🎙️ Mikrofon açıldı!');
    } catch (err) {
      isMicOpen = true; btn.classList.add('mic-active'); label.innerText = 'Bas-Konuş (Aktif)';
    }
  } else {
    if (localAudioStream) { localAudioStream.getTracks().forEach(t => t.stop()); localAudioStream = null; }
    isMicOpen = false; btn.classList.remove('mic-active'); label.innerText = 'Ses İlet (Kapalı)';
  }
};