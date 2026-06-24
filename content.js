if (!window.__annotFill) {
  window.__annotFill = true;

  let stop = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function click(el) {
    ['mousedown', 'mouseup', 'click'].forEach(type =>
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))
    );
  }

  function escape() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  // Set value in a React-controlled textarea (bypasses React's synthetic event system)
  function setReactTextarea(el, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // For div[contenteditable] fields
  function setEditableDiv(el, value) {
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, value);
  }

  // Universal setter: works for textarea and contenteditable div
  function setFieldValue(el, value) {
    if (el.tagName === 'TEXTAREA') {
      setReactTextarea(el, value);
    } else if (el.isContentEditable) {
      setEditableDiv(el, value);
    }
  }

  // Poll until a field with placeholder containing `text` appears
  async function findByPlaceholder(text, ms = 5000) {
    const lower = text.toLowerCase();
    const t = Date.now();
    while (Date.now() - t < ms) {
      const candidates = [
        ...document.querySelectorAll('textarea'),
        ...document.querySelectorAll('[contenteditable="true"]'),
      ];
      for (const el of candidates) {
        const ph = (
          el.placeholder ||
          el.getAttribute('data-placeholder') ||
          el.getAttribute('aria-placeholder') ||
          ''
        ).toLowerCase();
        if (ph.includes(lower)) return el;
      }
      await sleep(60);
    }
    return null;
  }

  // Open a BaseUI dropdown and pick the matching option
  async function pickOption(trigger, value) {
    click(trigger);
    // Wait for listbox
    const t = Date.now();
    let lb = null;
    while (Date.now() - t < 3000) {
      lb = document.querySelector('[role="listbox"]');
      if (lb) break;
      await sleep(60);
    }
    if (!lb) { escape(); return false; }
    await sleep(80);
    for (const opt of lb.querySelectorAll('[role="option"]')) {
      if (opt.textContent.trim().toLowerCase().includes(value.toLowerCase())) {
        click(opt); await sleep(300); return true;
      }
    }
    escape(); await sleep(150); return false;
  }

  // Get the transcription <p> element
  function getTranscriptionP(item) {
    for (const lbl of item.querySelectorAll('[data-baseweb="typo-labelxsmall"]')) {
      if (lbl.textContent.trim() === 'Transcription') {
        let el = lbl.nextElementSibling;
        while (el) { if (el.tagName === 'P') return el; el = el.nextElementSibling; }
      }
    }
    return item.querySelector('p[dir="auto"]');
  }

  // Analyse transcription spans to detect French words
  function analyzeSpans(p) {
    if (!p) return { plainText: '', taggedText: '', hasFrench: false };
    let hasFrench = false;

    const parts = [...p.querySelectorAll('span')].map(span => {
      const text = span.textContent;
      const isFrench =
        span.className.includes('jGNzYJ') ||
        /[a-zA-ZéèêëàâùûüîïôçœæÉÈÊËÀÂÙÛÜÎÏÔÇŒÆ]{2,}/.test(text);
      if (isFrench) hasFrench = true;
      return { text, isFrench };
    });

    const plainText  = parts.map(p => p.text).join(' ').trim();
    const taggedText = parts.map(({ text, isFrench }) =>
      isFrench ? text + '</lang:French>' : text
    ).join(' ').trim();

    return { plainText, taggedText, hasFrench };
  }

  // Click the Edit button inside an item
  function clickEditBtn(item) {
    for (const btn of item.querySelectorAll('button[data-baseweb="button"]')) {
      if (btn.textContent.trim().toLowerCase() === 'edit') {
        click(btn); return true;
      }
    }
    return false;
  }

  // Click Save changes button (searches whole document)
  async function clickSaveChanges() {
    for (const btn of document.querySelectorAll('button[data-baseweb="button"]')) {
      const txt = btn.textContent.trim().toLowerCase();
      if (txt.includes('save') || txt.includes('sauvegarder')) {
        click(btn); await sleep(600); return true;
      }
    }
    return false;
  }

  async function processItem(item, cfg, i, tot, port) {
    // 1. Scroll to item
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(400);

    // 2. Read transcription spans BEFORE clicking Edit
    const p = getTranscriptionP(item);
    const { plainText, taggedText, hasFrench } = analyzeSpans(p);

    if (!plainText) {
      port.postMessage({ type: 'WARN', text: `Item ${i + 1}: transcription vide, ignoré.` });
      port.postMessage({ type: 'PROGRESS', cur: i + 1, tot });
      return;
    }

    // 3. Click Edit button
    const editFound = clickEditBtn(item);
    if (!editFound) {
      port.postMessage({ type: 'WARN', text: `Item ${i + 1}: bouton Edit introuvable.` });
      port.postMessage({ type: 'PROGRESS', cur: i + 1, tot });
      return;
    }

    // 4. Wait for edit mode to fully load
    await sleep(800);

    // 5. Find Transliteration field by its placeholder "Enter transliteration transcript..."
    const transliterationField = await findByPlaceholder('transliteration', 5000);

    if (transliterationField) {
      // Copy plain transcription text into Transliteration
      setFieldValue(transliterationField, plainText);
      await sleep(300);
    } else {
      port.postMessage({ type: 'WARN', text: `Item ${i + 1}: champ Transliteration introuvable.` });
    }

    // 6. If French detected, update Transcription field with </lang:French> tags
    if (hasFrench) {
      // The Transcription textarea is any textarea that is NOT the transliteration one
      const allTA = document.querySelectorAll('textarea');
      for (const ta of allTA) {
        if (ta !== transliterationField) {
          setReactTextarea(ta, taggedText);
          await sleep(200);
          break;
        }
      }
    }

    // 7. Click Save changes
    const saved = await clickSaveChanges();
    if (!saved) {
      port.postMessage({ type: 'WARN', text: `Item ${i + 1}: bouton "Save changes" introuvable.` });
    }

    port.postMessage({ type: 'PROGRESS', cur: i + 1, tot });
    await sleep(cfg.delay || 700);
  }

  async function run(cfg, port) {
    const list = document.querySelector('[data-testid="annotation-list"]');
    if (!list) {
      port.postMessage({ type: 'ERROR', text: 'Liste d\'annotations introuvable.' }); return;
    }
    const items = [...list.querySelectorAll('[data-testid^="annotation-list-item-"]')];
    const tot = items.length;
    if (!tot) {
      port.postMessage({ type: 'ERROR', text: 'Aucun item trouvé.' }); return;
    }

    for (let i = 0; i < items.length; i++) {
      if (stop) { port.postMessage({ type: 'STOP', cur: i, tot }); return; }
      await processItem(items[i], cfg, i, tot, port);
    }

    port.postMessage({ type: 'DONE', tot });
  }

  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'annot-fill') return;
    port.onMessage.addListener(async msg => {
      if (msg.type === 'START') {
        stop = false;
        try { await run(msg.cfg, port); }
        catch (e) { port.postMessage({ type: 'ERROR', text: e.message }); }
      }
      if (msg.type === 'STOP') stop = true;
    });
  });
}
