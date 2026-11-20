// ================= TRẠNG THÁI ỨNG DỤNG =================
let mode = 'local'; // 'local' hoặc 'youtube'
const queues = { local: [], youtube: [] };
const currentIndex = { local: -1, youtube: -1 };
let isLooping = false;
const speeds = [1, 1.25, 1.5, 2, 0.75];
let speedIdx = 0;

// YouTube Player state
let ytPlayer = null;
let ytReady = false;
let ytPlaying = false;

// Web Audio API (cho Audio Visualizer Local)
let audioCtx = null;
let analyser = null;
let dataArray = null;
let audioSourceConnected = false;

// ================= PHẦN TỬ DOM =================
const winEl = document.getElementById('player-window');
const titleBar = document.getElementById('title-bar');
const windowBody = document.getElementById('window-body');
const desktopIcon = document.getElementById('desktop-icon');

const audioEl = document.getElementById('audio-element');
const localScreen = document.getElementById('local-screen');
const ytPlayerWrap = document.getElementById('yt-player-wrap');
const spPlayerWrap = document.getElementById('sp-player-wrap');
const spInputBar = document.getElementById('sp-input-bar');
const spIframe = document.getElementById('sp-iframe');
const localInputBar = document.getElementById('local-input-bar');
const ytInputBar = document.getElementById('yt-input-bar');

const coverArt = document.getElementById('cover-art');
const coverPlaceholder = document.getElementById('cover-placeholder');
const localTitle = document.getElementById('local-title');
const localArtist = document.getElementById('local-artist');
const ytTitle = document.getElementById('yt-title');
const ytArtist = document.getElementById('yt-artist');

const queueCount = document.getElementById('queue-count');
const queueDrawer = document.getElementById('queue-drawer');
const queueList = document.getElementById('queue-list');

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const btnSpeed = document.getElementById('btn-speed');
const btnPlay = document.getElementById('btn-play');
const btnLoop = document.getElementById('btn-loop');

const timeCurrent = document.getElementById('time-current');
const timeDuration = document.getElementById('time-duration');
const canvas = document.getElementById('visualizer-canvas');
const ctx = canvas.getContext('2d');

// ================= 1. KÉO THẢ & THU GỌN CỬA SỔ =================
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

titleBar.addEventListener('mousedown', (e) => {
  if (e.target.tagName === 'BUTTON') return;
  isDragging = true;
  const rect = winEl.getBoundingClientRect();
  winEl.style.position = 'fixed';
  winEl.style.left = `${rect.left}px`;
  winEl.style.top = `${rect.top}px`;
  winEl.style.margin = '0';
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  winEl.style.left = `${e.clientX - dragOffsetX}px`;
  winEl.style.top = `${e.clientY - dragOffsetY}px`;
});

document.addEventListener('mouseup', () => {
  isDragging = false;
});

document.getElementById('btn-minimize').addEventListener('click', () => {
  windowBody.classList.toggle('hidden');
});

document.getElementById('btn-close').addEventListener('click', () => {
  stopPlayback();
  window.close();
});

desktopIcon.addEventListener('click', () => {
  winEl.classList.remove('hidden');
  windowBody.classList.remove('hidden');
  desktopIcon.classList.add('hidden');
});

// ================= 2. KHỞI TẠO YOUTUBE IFRAME API =================
window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player('yt-player', {
    height: '100%',
    width: '100%',
    playerVars: {
      controls: 0,
      rel: 0,
      modestbranding: 1,
      iv_load_policy: 3
    },
    events: {
      onReady: () => {
        ytReady = true;
        ytPlayer.setVolume(Number(document.getElementById('volume-slider').value));
      },
      onStateChange: onYTStateChange
    }
  });
};

function onYTStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    ytPlaying = true;
    setStatus(true, 'Playing');
    btnPlay.textContent = '⏸';

    // Tự động lấy tên video & tên kênh thật từ YouTube
    const data = ytPlayer.getVideoData();
    if (data && data.title) {
      ytTitle.textContent = data.title;
      ytArtist.textContent = data.author || 'YouTube';
      const idx = currentIndex.youtube;
      if (queues.youtube[idx]) {
        queues.youtube[idx].title = data.title;
        queues.youtube[idx].artist = data.author || 'YouTube';
        renderQueue();
      }
    }
  } else if (event.data === YT.PlayerState.PAUSED) {
    ytPlaying = false;
    setStatus(false, 'Paused');
    btnPlay.textContent = '▶';
  } else if (event.data === YT.PlayerState.ENDED) {
    ytPlaying = false;
    if (isLooping) {
      ytPlayer.seekTo(0);
      ytPlayer.playVideo();
    } else {
      playNext();
    }
  }
}

// ================= 3. CHUYỂN CHẾ ĐỘ LOCAL / YOUTUBE /  =================
document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener('change', (e) => {
    stopPlayback();
    mode = e.target.value;

    localScreen.classList.toggle('hidden', mode !== 'local');
    localInputBar.classList.toggle('hidden', mode !== 'local');
    ytPlayerWrap.classList.toggle('hidden', mode !== 'youtube');
    ytInputBar.classList.toggle('hidden', mode !== 'youtube');
    spPlayerWrap.classList.toggle('hidden', mode !== 'spotify');
    spInputBar.classList.toggle('hidden', mode !== 'spotify');

    queueDrawer.classList.add('hidden');
    if (mode !== 'spotify') renderQueue();
  });
});

// ================= 4. LOCAL MUSIC & ĐỌC ẢNH BÌA MP3 =================
const fileInput = document.getElementById('file-input');
document.getElementById('btn-add-music').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const wasEmpty = queues.local.length === 0;

  files.forEach((file) => {
    const item = {
      url: URL.createObjectURL(file),
      title: file.name.replace(/\.[^/.]+$/, ''),
      artist: 'Local Audio File',
      cover: null
    };
    queues.local.push(item);
    readMp3Metadata(file, item);
  });

  renderQueue();
  if (wasEmpty) {
    playTrackAt(0);
  }
  fileInput.value = '';
});

function readMp3Metadata(file, item) {
  if (!window.jsmediatags) return;
  window.jsmediatags.read(file, {
    onSuccess: (tag) => {
      const tags = tag.tags;
      if (tags.title) item.title = tags.title;
      if (tags.artist) item.artist = tags.artist;
      if (tags.picture) {
        const { data, format } = tags.picture;
        let base64String = '';
        for (let i = 0; i < data.length; i++) {
          base64String += String.fromCharCode(data[i]);
        }
        item.cover = `data:${format};base64,${window.btoa(base64String)}`;
      }

      // Cập nhật ngay nếu bài này đang phát
      if (mode === 'local' && queues.local[currentIndex.local] === item) {
        updateLocalDisplay(item);
      }
      renderQueue();
    },
    onError: () => {}
  });
}

function updateLocalDisplay(item) {
  localTitle.textContent = item.title;
  localArtist.textContent = item.artist;
  if (item.cover) {
    coverArt.src = item.cover;
    coverArt.classList.remove('hidden');
    coverPlaceholder.classList.add('hidden');
  } else {
    coverArt.classList.add('hidden');
    coverPlaceholder.classList.remove('hidden');
  }
}

document.getElementById('btn-clear-local').addEventListener('click', () => {
  stopPlayback();
  queues.local.forEach((item) => URL.revokeObjectURL(item.url));
  queues.local = [];
  currentIndex.local = -1;
  localTitle.textContent = 'Chưa có bài hát nào';
  localArtist.textContent = 'Chọn file .mp3 hoặc .wav bên dưới';
  coverArt.classList.add('hidden');
  coverPlaceholder.classList.remove('hidden');
  renderQueue();
});

// ================= 5. THÊM LINK YOUTUBE =================
function extractYouTubeId(url) {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

document.getElementById('btn-load-yt').addEventListener('click', loadYouTubeInput);
document.getElementById('yt-url-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadYouTubeInput();
});

function loadYouTubeInput() {
  const input = document.getElementById('yt-url-input');
  const videoId = extractYouTubeId(input.value.trim());
  if (!videoId) {
    alert('Link YouTube không hợp lệ! Hãy dán link dạng youtube.com/watch?v=... hoặc youtu.be/...');
    return;
  }

  queues.youtube.push({
    videoId,
    title: `YouTube Video (${videoId})`,
    artist: 'Đang tải thông tin...'
  });

  const newIdx = queues.youtube.length - 1;
  input.value = '';
  renderQueue();
  playTrackAt(newIdx);
}

// ================= 6. ĐIỀU KHIỂN PHÁT & QUEUE =================
function initWebAudio() {
  if (audioSourceConnected) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContextClass();
  const source = audioCtx.createMediaElementSource(audioEl);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 128;
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  audioSourceConnected = true;
}

function playTrackAt(index) {
  const list = queues[mode];
  if (!list.length || index < 0 || index >= list.length) return;
  currentIndex[mode] = index;
  const item = list[index];

  if (mode === 'local') {
    initWebAudio();
    audioEl.src = item.url;
    audioEl.playbackRate = speeds[speedIdx];
    updateLocalDisplay(item);
    audioEl.play();
    btnPlay.textContent = '⏸';
    setStatus(true, 'Playing');
  } else if (ytReady) {
    ytPlayer.loadVideoById(item.videoId);
    ytPlayer.setPlaybackRate(speeds[speedIdx]);
    ytTitle.textContent = item.title;
    ytArtist.textContent = item.artist;
    btnPlay.textContent = '⏸';
    setStatus(true, 'Loading...');
  }
  renderQueue();
}

btnPlay.addEventListener('click', () => {
  if (mode === 'local') {
    if (!queues.local.length) return;
    if (currentIndex.local === -1) return playTrackAt(0);
    initWebAudio();
    if (audioEl.paused) {
      audioEl.play();
      btnPlay.textContent = '⏸';
      setStatus(true, 'Playing');
    } else {
      audioEl.pause();
      btnPlay.textContent = '▶';
      setStatus(false, 'Paused');
    }
  } else if (ytReady && queues.youtube.length) {
    if (currentIndex.youtube === -1) return playTrackAt(0);
    if (ytPlaying) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  }
});

document.getElementById('btn-stop').addEventListener('click', stopPlayback);

function stopPlayback() {
  audioEl.pause();
  audioEl.currentTime = 0;
  if (ytReady && ytPlayer.stopVideo) {
    ytPlayer.stopVideo();
  }
  ytPlaying = false;
  btnPlay.textContent = '▶';
  setStatus(false, 'Stopped');
  timeCurrent.textContent = '00:00';
}

function playNext() {
  const list = queues[mode];
  if (!list.length) return;
  const next = (currentIndex[mode] + 1) % list.length;
  playTrackAt(next);
}

function playPrev() {
  const list = queues[mode];
  if (!list.length) return;
  const prev = (currentIndex[mode] - 1 + list.length) % list.length;
  playTrackAt(prev);
}

document.getElementById('btn-next').addEventListener('click', playNext);
document.getElementById('btn-prev').addEventListener('click', playPrev);

audioEl.addEventListener('ended', () => {
  if (isLooping) {
    audioEl.currentTime = 0;
    audioEl.play();
  } else {
    playNext();
  }
});

btnLoop.addEventListener('click', () => {
  isLooping = !isLooping;
  btnLoop.classList.toggle('loop-on', isLooping);
});

btnSpeed.addEventListener('click', () => {
  speedIdx = (speedIdx + 1) % speeds.length;
  const rate = speeds[speedIdx];
  btnSpeed.textContent = `${rate}x`;
  audioEl.playbackRate = rate;
  if (ytReady && ytPlayer.setPlaybackRate) {
    ytPlayer.setPlaybackRate(rate);
  }
});

document.getElementById('volume-slider').addEventListener('input', (e) => {
  const val = Number(e.target.value);
  audioEl.volume = val / 100;
  if (ytReady && ytPlayer.setVolume) {
    ytPlayer.setVolume(val);
  }
});

// Ngăn kéo Queue
document.getElementById('btn-queue-toggle').addEventListener('click', () => {
  queueDrawer.classList.toggle('hidden');
});
document.getElementById('btn-close-queue').addEventListener('click', () => {
  queueDrawer.classList.add('hidden');
});

function renderQueue() {
  const list = queues[mode];
  queueCount.textContent = list.length;
  queueList.innerHTML = '';

  if (!list.length) {
    queueList.innerHTML = '<li class="queue-empty">Danh sách trống</li>';
    return;
  }

  list.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = `queue-item ${idx === currentIndex[mode] ? 'current' : ''}`;

    const span = document.createElement('span');
    span.className = 'queue-item-name';
    span.textContent = `${idx + 1}. ${item.title}`;
    span.onclick = () => {
      playTrackAt(idx);
      queueDrawer.classList.add('hidden');
    };

    const delBtn = document.createElement('button');
    delBtn.className = 'queue-remove';
    delBtn.textContent = '✕';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      list.splice(idx, 1);
      if (currentIndex[mode] === idx) {
        stopPlayback();
        currentIndex[mode] = -1;
      } else if (currentIndex[mode] > idx) {
        currentIndex[mode]--;
      }
      renderQueue();
    };

    li.appendChild(span);
    li.appendChild(delBtn);
    queueList.appendChild(li);
  });
}

function setStatus(playing, text) {
  statusDot.className = `status-dot ${playing ? 'playing' : 'idle'}`;
  statusText.textContent = text;
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '00:00';
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ================= 7. SÓNG NHẠC VISUALIZER & TUA NHẠC =================
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

  if (mode === 'local' && audioEl.duration) {
    audioEl.currentTime = ratio * audioEl.duration;
  } else if (mode === 'youtube' && ytReady && ytPlayer.getDuration) {
    const dur = ytPlayer.getDuration();
    if (dur > 0) ytPlayer.seekTo(ratio * dur, true);
  }
});

const BAR_COUNT = 36;
const smoothBars = new Array(BAR_COUNT).fill(3);

function renderVisualizer(timestamp) {
  let cur = 0;
  let dur = 0;
  let isPlayingNow = false;

  if (mode === 'local') {
    cur = audioEl.currentTime || 0;
    dur = audioEl.duration || 0;
    isPlayingNow = !audioEl.paused && dur > 0;
  } else if (ytReady && ytPlayer.getCurrentTime) {
    cur = ytPlayer.getCurrentTime() || 0;
    dur = ytPlayer.getDuration() || 0;
    isPlayingNow = ytPlaying && dur > 0;
  }

  timeCurrent.textContent = formatTime(cur);
  timeDuration.textContent = formatTime(dur);

  const progress = dur > 0 ? cur / dur : 0;
  const w = canvas.width;
  const h = canvas.height;

  // Nền xanh cổ điển của thanh sóng nhạc
  ctx.fillStyle = '#26315e';
  ctx.fillRect(0, 0, w, h);

  if (mode === 'local' && analyser && isPlayingNow) {
    analyser.getByteFrequencyData(dataArray);
  }

  const gap = 2;
  const barW = (w - gap * (BAR_COUNT + 1)) / BAR_COUNT;

  for (let i = 0; i < BAR_COUNT; i++) {
    let targetH = 3;

    if (mode === 'local' && analyser && isPlayingNow) {
      const bin = Math.floor((i / BAR_COUNT) * (dataArray.length * 0.75));
      targetH = Math.max(3, (dataArray[bin] / 255) * (h - 4));
    } else if (mode === 'youtube' && isPlayingNow) {
      // Sóng nhạc mô phỏng mượt cho YouTube
      const wave = Math.sin(timestamp * 0.008 + i * 0.6) * 0.5 + 0.5;
      const beat = Math.cos(timestamp * 0.015 - i * 0.3) * 0.5 + 0.5;
      targetH = 4 + wave * beat * (h - 6);
    }

    smoothBars[i] += (targetH - smoothBars[i]) * 0.25;
    const barH = smoothBars[i];
    const x = gap + i * (barW + gap);
    const y = h - barH - 1;

    // Đổi màu sáng hơn cho phần bài hát đã chạy qua
    const barProgress = (i + 0.5) / BAR_COUNT;
    ctx.fillStyle = barProgress <= progress ? '#9db4ff' : '#4b5c9e';
    ctx.fillRect(x, y, barW, barH);
  }

  // Con trỏ tiến trình màu vàng cam nổi bật
  if (dur > 0) {
    const px = Math.min(w - 4, Math.max(0, progress * w - 2));
    ctx.fillStyle = '#f5b301';
    ctx.fillRect(px, 0, 4, h);
  }

  requestAnimationFrame(renderVisualizer);
}

requestAnimationFrame(renderVisualizer);
// ================= 8. TẢI LINK SPOTIFY =================
function loadSpotifyInput() {
  const input = document.getElementById('sp-url-input');
  const url = input.value.trim();
  // Hỗ trợ link bài hát (track), album hoặc playlist
  const match = url.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
  if (!match) {
    alert('Link Spotify không hợp lệ! Hãy dán link bài hát, album hoặc playlist từ open.spotify.com');
    return;
  }
  const type = match[1];
  const id = match[2];
  spIframe.src = `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
  setStatus(true, 'Spotify Ready');
}

document.getElementById('btn-load-sp').addEventListener('click', loadSpotifyInput);
document.getElementById('sp-url-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadSpotifyInput();
});