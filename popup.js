let port = null;
const $ = id => document.getElementById(id);

function setStatus(msg) { $('statusText').textContent = msg; }

function setProgress(cur, tot) {
  $('progressWrap').classList.remove('hidden');
  $('barFill').style.width = (tot ? (cur / tot) * 100 : 0) + '%';
  setStatus(`${cur} / ${tot}`);
}

function setRunning(on) {
  $('startBtn').disabled = on;
  $('stopBtn').disabled  = !on;
}

$('startBtn').addEventListener('click', async () => {
  $('progressWrap').classList.add('hidden');

  const cfg = { delay: parseInt($('delay').value) || 700 };
  chrome.storage.local.set({ cfg });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (e) {
    setStatus('Injection échouée : ' + e.message); return;
  }

  await new Promise(r => setTimeout(r, 300));

  try {
    port = chrome.tabs.connect(tab.id, { name: 'annot-fill' });
  } catch (e) {
    setStatus('Connexion échouée'); return;
  }

  port.onDisconnect.addListener(() => { setRunning(false); port = null; });

  port.onMessage.addListener(msg => {
    if (msg.type === 'PROGRESS') setProgress(msg.cur, msg.tot);
    if (msg.type === 'ERROR')    { setStatus('Erreur : ' + msg.text); setRunning(false); }
    if (msg.type === 'DONE')     { setStatus('Terminé ✓'); setProgress(msg.tot, msg.tot); setRunning(false); }
    if (msg.type === 'STOP')     { setStatus('Arrêté'); setRunning(false); }
  });

  port.postMessage({ type: 'START', cfg });
  setRunning(true);
  setStatus('En cours…');
  $('progressWrap').classList.remove('hidden');
});

$('stopBtn').addEventListener('click', () => port && port.postMessage({ type: 'STOP' }));

chrome.storage.local.get('cfg', ({ cfg }) => {
  if (cfg) $('delay').value = cfg.delay || 700;
});
