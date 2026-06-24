if (!window.__annotFill) {
  window.__annotFill = true;

  let stop = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Arabic number converter
  function numberToArabicWords(n) {
    if (n === 0) return 'صفر';
    const ones = [
      '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة',
      'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
      'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
      'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
    ];
    const tens = ['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
    const hundreds = ['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];

    function below100(n) {
      if (n < 20) return ones[n];
      const t = Math.floor(n / 10), u = n % 10;
      return u === 0 ? tens[t] : ones[u] + ' و' + tens[t];
    }
    function below1000(n) {
      const h = Math.floor(n / 100), r = n % 100;
      if (h === 0) return below100(r);
      if (r === 0) return hundreds[h];
      return hundreds[h] + ' و' + below100(r);
    }
    function below1000000(n) {
      const th = Math.floor(n / 1000), r = n % 1000;
      if (th === 0) return below1000(r);
      let tw;
      if      (th === 1) tw = 'ألف';
      else if (th === 2) tw = 'ألفان';
      else if (th <= 10) tw = below1000(th) + ' آلاف';
      else               tw = below1000(th) + ' ألف';
      return r === 0 ? tw : tw + ' و' + below1000(r);
    }
    if (n < 1000000) return below1000000(n);
    const m = Math.floor(n / 1000000), r = n % 1000000;
    let mw;
    if      (m === 1) mw = 'مليون';
    else if (m === 2) mw = 'مليونان';
    else if (m <= 10) mw = below1000(m) + ' ملايين';
    else              mw = below1000(m) + ' مليون';
    return r === 0 ? mw : mw + ' و' + below1000000(r);
  }

  function convertDigitsToWords(text) {
    return text.replace(/\d+/g, match => numberToArabicWords(parseInt(match, 10)));
  }

  // French to Arabic translation via background service worker
  async function translateFrToAr(text) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'TRANSLATE_FR_AR', text }, res => {
        if (chrome.runtime.lastError || !res) resolve(text);
        else resolve(res.translated || text);
      });
    });
  }

  // Build Transliteration text: French groups translated, Arabic digits converted
  async function buildTransliterationText(words) {
    const groups = [];
    let cur = null;
    for (const { text, isFrench } of words) {
      if (!text) continue;
      if (!cur || cur.isFrench !== isFrench) {
        cur = { isFrench, texts: [] };
        groups.push(cur);
      }
      cur.texts.push(text);
    }
    const parts = [];
    for (const g of groups) {
      const joined = g.texts.join(' ');
      parts.push(g.isFrench ? await translateFrToAr(joined) : convertDigitsToWords(joined));
    }
    return parts.join(' ').trim();
  }

  // DOM helpers
  function click(el) {
    ['mousedown', 'mouseup', 'click'].forEach(type =>
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))
    );
  }

  function escape() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  function setReactTextarea(el, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setEditableDiv(el, value) {
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, value);
  }

  function setFieldValue(el, value) {
    if (el.tagName === 'TEXTAREA')  setReactTextarea(el, value);
    else if (el.isContentEditable) setEditableDiv(el, value);
  }

  async function findByPlaceholder(text, ms = 5000) {
    const lower = text.toLowerCase();
    const t = Date.now();
    while (Date.now() - t < ms) {
      for (const el of [
        ...document.querySelectorAll('textarea'),
        ...document.querySelectorAll('[contenteditable="true"]'),
      ]) {
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

  // Dropdown helpers
  // Finds the clickable trigger next to a label.
  // Key fix: only strip * and non-breaking spaces ( ), NOT regular spaces,
  // so "Primary Type" stays "Primary Type" and can be matched.
  function findDropdownByLabel(labelText, root) {
    root = root || document;
    const search = labelText.toLowerCase();
    for (const lbl of root.querySelectorAll('[data-baseweb="typo-labelxsmall"]')) {
      const t = lbl.textContent
        .replace(/\*/g, '')
        .replace(/ /g, ' ')
        .trim()
        .toLowerCase();
      if (!t.includes(search)) continue;

      // Walk up the DOM (up to 6 levels) until we find a clickable trigger
      for (let el = lbl.parentElement, d = 0; el && d < 6; el = el.parentElement, d++) {
        const trigger =
          el.querySelector('[data-baseweb="tag"][role="button"]') ||
          el.querySelector('[role="combobox"]')                   ||
          el.querySelector('[data-baseweb="select"]')             ||
          el.querySelector('button');
        if (trigger && !lbl.contains(trigger)) return trigger;
      }
    }
    return null;
  }

  async function pickOption(trigger, value) {
    // Prefer the inner interactive element; fall back to the container
    const inner = trigger.matches('[role="button"],[role="combobox"],button')
      ? trigger
      : (trigger.querySelector('[role="button"],[role="combobox"],button') || trigger);
    click(inner);

    const t = Date.now();
    let lb = null;
    while (Date.now() - t < 3000) {
      lb = document.querySelector('[role="listbox"]');
      if (lb) break;
      await sleep(60);
    }
    // Second attempt: click the container itself if no listbox appeared
    if (!lb) {
      click(trigger);
      await sleep(300);
      lb = document.querySelector('[role="listbox"]');
    }
    if (!lb) { escape(); return false; }

    await sleep(80);
    // The listbox nests options: outer <li role="option"> contains all choices,
    // inner <div role="option"> contains exactly one label.
    // Sort by textContent length (ascending) so the most specific element wins.
    const allOpts = [...lb.querySelectorAll('[role="option"]')];
    const match = allOpts
      .filter(o => o.textContent.trim().toLowerCase().includes(value.toLowerCase()))
      .sort((a, b) => a.textContent.trim().length - b.textContent.trim().length)[0];
    if (match) { click(match); await sleep(300); return true; }
    escape(); await sleep(150); return false;
  }

  // Fill all 4 dropdowns. Secondary Language = French if French detected, else NONE.
  // root   = element to scope the search (pass the item in read-only mode)
  // anchor = element to scroll back to after each selection (prevents page jumping)
  async function fillDropdowns(hasFrench, root, anchor) {
    const dropdowns = [
      { label: 'Primary Type',               value: 'Speech'  },
      { label: 'Loudness Level',             value: 'Normal'  },
      { label: 'Segment Primary Language',   value: 'Arabic'  },
      { label: 'Segment Secondary Language', value: hasFrench ? 'French' : 'NONE' },
    ];
    for (const { label, value } of dropdowns) {
      const trigger = findDropdownByLabel(label, root);
      if (!trigger) continue;
      // Already has the right value - skip to avoid unnecessary re-renders
      const current = trigger.textContent.toLowerCase();
      if (current.includes(value.toLowerCase())) continue;
      await pickOption(trigger, value);
      // Re-scroll to the item after each selection (page may jump otherwise)
      if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(300);
    }
  }

  // Span analysis
  function getTranscriptionP(item) {
    for (const lbl of item.querySelectorAll('[data-baseweb="typo-labelxsmall"]')) {
      if (lbl.textContent.trim() === 'Transcription') {
        let el = lbl.nextElementSibling;
        while (el) { if (el.tagName === 'P') return el; el = el.nextElementSibling; }
      }
    }
    return item.querySelector('p[dir="auto"]');
  }

  function analyzeSpans(p) {
    if (!p) return { words: [], plainText: '', taggedText: '', hasFrench: false };
    let hasFrench = false;

    const words = [...p.querySelectorAll('span')].map(span => {
      const raw = span.textContent;
      const wasTagged = /<\/?lang:French>/i.test(raw);
      const text = raw.replace(/<\/?lang:French>/gi, '').trim();
      if (!text) return null;
      // Any single Latin letter = French/foreign word (Arabic script never uses Latin)
      const isFrench =
        wasTagged ||
        span.className.includes('jGNzYJ') ||
        /[a-zA-ZÀ-ɏ]/.test(text);
      if (isFrench) hasFrench = true;
      return { text, isFrench };
    }).filter(Boolean);

    const plainText  = words.map(w => w.text).join(' ').trim();
    const taggedText = words.map(({ text, isFrench }) =>
      isFrench ? text + '</lang:French>' : text
    ).join(' ').trim();

    return { words, plainText, taggedText, hasFrench };
  }

  // Item processing
  function clickEditBtn(item) {
    for (const btn of item.querySelectorAll('button[data-baseweb="button"]')) {
      if (btn.textContent.trim().toLowerCase() === 'edit') {
        click(btn); return true;
      }
    }
    return false;
  }

  async function clickSaveChanges() {
    for (const btn of document.querySelectorAll('button[data-baseweb="button"]')) {
      const txt = btn.textContent.trim().toLowerCase();
      if (txt.includes('save') || txt.includes('sauvegarder')) {
        click(btn); await sleep(600); return true;
      }
    }
    return false;
  }

  // Click the Resume button if it appears on the page (session timeout / interruption)
  async function clickResumeIfPresent() {
    for (const btn of document.querySelectorAll('button')) {
      if (/resum/i.test(btn.textContent.trim())) {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(600);
        return true;
      }
    }
    return false;
  }

  async function processItem(item, cfg, i, tot, port) {
    // 0. Click Resume if the session was interrupted
    await clickResumeIfPresent();

    // 1. Scroll to item
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(400);

    // 2. Read transcription spans BEFORE clicking Edit
    const p = getTranscriptionP(item);
    const { words, plainText, taggedText, hasFrench } = analyzeSpans(p);

    if (!plainText) {
      port.postMessage({ type: 'WARN', text: 'Item ' + (i + 1) + ': transcription vide, ignore.' });
      port.postMessage({ type: 'PROGRESS', cur: i + 1, tot });
      return;
    }

    // 3. Click Edit to enter edit mode
    if (!clickEditBtn(item)) {
      port.postMessage({ type: 'WARN', text: 'Item ' + (i + 1) + ': bouton Edit introuvable.' });
      port.postMessage({ type: 'PROGRESS', cur: i + 1, tot });
      return;
    }

    // 4. Wait for edit mode; poll until Primary Type trigger is present (max 3s)
    await sleep(500);
    for (let w = 0; w < 15 && !findDropdownByLabel('Primary Type', item); w++) await sleep(200);

    // 5. Fill 4 dropdowns in edit mode (triggers confirmed as [data-baseweb="tag"][role="button"])
    //    Scope search to this item; re-scroll after each pick.
    await fillDropdowns(hasFrench, item, item);

    // 6. Fill Transliteration: French words translated to Arabic, digits to Arabic words
    const transliterationField = await findByPlaceholder('transliteration', 5000);
    if (transliterationField) {
      const transliterationText = await buildTransliterationText(words);
      setFieldValue(transliterationField, transliterationText);
      transliterationField.setAttribute('dir', 'rtl');
      transliterationField.style.direction   = 'rtl';
      transliterationField.style.textAlign   = 'right';
      transliterationField.style.unicodeBidi = 'embed';
      await sleep(300);
    } else {
      port.postMessage({ type: 'WARN', text: 'Item ' + (i + 1) + ': champ Transliteration introuvable.' });
    }

    // 7. If French detected, write tagged text into Transcription textarea
    if (hasFrench) {
      const allTA = document.querySelectorAll('textarea');
      for (const ta of allTA) {
        if (ta !== transliterationField) {
          setReactTextarea(ta, taggedText);
          await sleep(200);
          break;
        }
      }
    }

    // 8. Save
    if (!(await clickSaveChanges())) {
      port.postMessage({ type: 'WARN', text: 'Item ' + (i + 1) + ': bouton Save introuvable.' });
    }

    port.postMessage({ type: 'PROGRESS', cur: i + 1, tot });
    await sleep(cfg.delay || 700);
  }

  // Main loop
  async function run(cfg, port) {
    const list = document.querySelector('[data-testid="annotation-list"]');
    if (!list) {
      port.postMessage({ type: 'ERROR', text: 'Liste introuvable.' }); return;
    }
    const items = [...list.querySelectorAll('[data-testid^="annotation-list-item-"]')];
    const tot = items.length;
    if (!tot) {
      port.postMessage({ type: 'ERROR', text: 'Aucun item trouve.' }); return;
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
