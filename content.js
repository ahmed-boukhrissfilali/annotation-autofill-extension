(function () {
  const _ex = document.getElementById('__AF_panel');
  if (_ex) { _ex.style.display = ''; return; }

  let stop = false, _submitTimer = null, _countdownTimer = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---- Arabic number words ---- */
  function numberToArabicWords(n) {
    if (n===0) return 'صفر';
    const ones=['',' واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
    const tens=['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
    const hundreds=['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];
    function b100(n){if(n<20)return ones[n];const t=Math.floor(n/10),u=n%10;return u===0?tens[t]:ones[u]+' و'+tens[t];}
    function b1000(n){const h=Math.floor(n/100),r=n%100;if(!h)return b100(r);if(!r)return hundreds[h];return hundreds[h]+' و'+b100(r);}
    function b1m(n){const th=Math.floor(n/1000),r=n%1000;if(!th)return b1000(r);let tw;if(th===1)tw='ألف';else if(th===2)tw='ألفان';else if(th<=10)tw=b1000(th)+' آلاف';else tw=b1000(th)+' ألف';return r?tw+' و'+b1000(r):tw;}
    if(n<1000000)return b1m(n);
    const m=Math.floor(n/1000000),r=n%1000000;let mw;if(m===1)mw='مليون';else if(m===2)mw='مليونان';else if(m<=10)mw=b1000(m)+' ملايين';else mw=b1000(m)+' مليون';return r?mw+' و'+b1m(r):mw;
  }
  function convertDigitsToWords(t){return t.replace(/\d+/g,m=>numberToArabicWords(parseInt(m,10)));}

  /* ---- Phonetic transliteration FR → AR ---- */
  function transliterateFrToAr(text) {
    // Rules ordered longest-first to avoid partial matches
    const rules = [
      // Multi-letter French sequences → Arabic phonetic
      ['tion',  'سيون'], ['sion',  'زيون'], ['ille',  'إي'],
      ['eau',   'و'],    ['ain',   'إن'],   ['ein',   'إن'],
      ['oin',   'وإن'],  ['ion',   'يون'],  ['ieu',   'يو'],
      ['oeu',   'و'],    ['oei',   'وي'],   ['gn',    'ني'],
      ['ch',    'ش'],    ['ph',    'ف'],    ['qu',    'ك'],
      ['th',    'ت'],    ['ck',    'ك'],    ['ou',    'و'],
      ['oi',    'وا'],   ['ai',    'إي'],   ['ei',    'إي'],
      ['au',    'و'],    ['eu',    'و'],    ['ae',    'إي'],
      // Single letters
      ['â', 'ا'], ['à', 'ا'], ['á', 'ا'], ['ä', 'ا'],
      ['é', 'إي'], ['è', 'إي'], ['ê', 'إي'], ['ë', 'إي'],
      ['î', 'ي'], ['ï', 'ي'], ['í', 'ي'],
      ['ô', 'و'], ['ö', 'و'], ['ò', 'و'], ['ó', 'و'],
      ['û', 'و'], ['ü', 'و'], ['ù', 'و'], ['ú', 'و'],
      ['ç', 'س'],
      ['a', 'ا'], ['b', 'ب'], ['c', 'ك'], ['d', 'د'],
      ['e', 'إ'], ['f', 'ف'], ['g', 'غ'], ['h', ''],
      ['i', 'ي'], ['j', 'ج'], ['k', 'ك'], ['l', 'ل'],
      ['m', 'م'], ['n', 'ن'], ['o', 'و'], ['p', 'ب'],
      ['q', 'ك'], ['r', 'ر'], ['s', 'س'], ['t', 'ت'],
      ['u', 'و'], ['v', 'ڤ'], ['w', 'و'], ['x', 'كس'],
      ['y', 'ي'], ['z', 'ز'],
    ];
    let result = text.toLowerCase();
    for (const [fr, ar] of rules) {
      result = result.split(fr).join(ar);
    }
    // Remove trailing silent letters that became empty
    return result.replace(/\s+/g, ' ').trim();
  }

  /* ---- Translation (fallback via API) ---- */
  async function translateFrToAr(text) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({type:'TRANSLATE_FR_AR',text}, res => {
        if(chrome.runtime.lastError||!res) resolve(text); else resolve(res.translated||text);
      });
    });
  }

  async function buildTransliterationText(words) {
    const groups=[]; let cur=null;
    for (const {text,isFrench} of words) {
      if(!text) continue;
      if(!cur||cur.isFrench!==isFrench){cur={isFrench,texts:[]};groups.push(cur);}
      cur.texts.push(text);
    }
    const parts=[];
    for(const g of groups){
      const j=g.texts.join(' ');
      // Use local phonetic transliteration (no API call needed)
      parts.push(g.isFrench ? transliterateFrToAr(j) : convertDigitsToWords(j));
    }
    return parts.join(' ').trim();
  }

  /* ---- DOM helpers ---- */
  function click(el){['mousedown','mouseup','click'].forEach(t=>el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true})));}
  function esc(){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}
  function setReactTA(el,value){
    const s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
    s.call(el,value);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function setField(el,value){
    if(el.tagName==='TEXTAREA') setReactTA(el,value);
    else if(el.isContentEditable){el.focus();document.execCommand('selectAll',false,null);document.execCommand('insertText',false,value);}
  }

  async function findByPH(text,ms=5000){
    const lower=text.toLowerCase(),t=Date.now();
    while(Date.now()-t<ms){
      for(const el of[...document.querySelectorAll('textarea'),...document.querySelectorAll('[contenteditable="true"]')]){
        const ph=(el.placeholder||el.getAttribute('data-placeholder')||el.getAttribute('aria-placeholder')||'').toLowerCase();
        if(ph.includes(lower)) return el;
      }
      await sleep(60);
    }
    return null;
  }

  function findDD(labelText,root){
    root=root||document;
    const s=labelText.toLowerCase();
    for(const lbl of root.querySelectorAll('[data-baseweb="typo-labelxsmall"]')){
      const t=lbl.textContent.replace(/\*/g,'').replace(/ /g,' ').trim().toLowerCase();
      if(!t.includes(s)) continue;
      for(let el=lbl.parentElement,d=0;el&&d<6;el=el.parentElement,d++){
        const tr=el.querySelector('[data-baseweb="tag"][role="button"]')||el.querySelector('[role="combobox"]')||el.querySelector('[data-baseweb="select"]')||el.querySelector('button');
        if(tr&&!lbl.contains(tr)) return tr;
      }
    }
    return null;
  }

  async function pickOpt(trigger,value){
    const inner=trigger.matches('[role="button"],[role="combobox"],button')?trigger:(trigger.querySelector('[role="button"],[role="combobox"],button')||trigger);
    click(inner);
    const t=Date.now();let lb=null;
    while(Date.now()-t<3000){lb=document.querySelector('[role="listbox"]');if(lb)break;await sleep(60);}
    if(!lb){click(trigger);await sleep(300);lb=document.querySelector('[role="listbox"]');}
    if(!lb){esc();return false;}
    await sleep(80);
    const match=[...lb.querySelectorAll('[role="option"]')].sort((a,b)=>a.textContent.trim().length-b.textContent.trim().length).find(o=>o.textContent.trim().toLowerCase().includes(value.toLowerCase()));
    if(match){click(match);await sleep(300);return true;}
    esc();await sleep(150);return false;
  }

  async function fillDDs(hasFrench,root,anchor){
    const dd=[{label:'Primary Type',value:'Speech'},{label:'Loudness Level',value:'Normal'},{label:'Segment Primary Language',value:'Arabic'},{label:'Segment Secondary Language',value:hasFrench?'French':'NONE'}];
    for(const{label,value}of dd){
      const tr=findDD(label,root);
      if(!tr) continue;
      if(tr.textContent.toLowerCase().includes(value.toLowerCase())) continue;
      await pickOpt(tr,value);
      if(anchor) anchor.scrollIntoView({behavior:'smooth',block:'center'});
      await sleep(300);
    }
  }

  function getTrP(item){
    for(const lbl of item.querySelectorAll('[data-baseweb="typo-labelxsmall"]')){
      if(lbl.textContent.trim()==='Transcription'){let el=lbl.nextElementSibling;while(el){if(el.tagName==='P')return el;el=el.nextElementSibling;}}
    }
    return item.querySelector('p[dir="auto"]');
  }

  function analyzeSpans(p){
    if(!p) return{words:[],plainText:'',taggedText:'',hasFrench:false};
    let hasFrench=false;
    const words=[...p.querySelectorAll('span')].map(span=>{
      const raw=span.textContent,wasTagged=/<\/?lang:French>/i.test(raw);
      const text=raw.replace(/<\/?lang:French>/gi,'').trim();
      if(!text) return null;
      const isFrench=wasTagged||span.className.includes('jGNzYJ')||/[a-zA-ZÀ-ɏ]/.test(text);
      if(isFrench) hasFrench=true;
      return{text,isFrench};
    }).filter(Boolean);
    return{words,plainText:words.map(w=>w.text).join(' ').trim(),taggedText:words.map(({text,isFrench})=>isFrench?text+'</lang:French>':text).join(' ').trim(),hasFrench};
  }

  function clickEdit(item){
    for(const btn of item.querySelectorAll('button[data-baseweb="button"]')){
      if(btn.textContent.trim().toLowerCase()==='edit'){click(btn);return true;}
    }
    return false;
  }

  async function save(){
    for(const btn of document.querySelectorAll('button[data-baseweb="button"]')){
      const t=btn.textContent.trim().toLowerCase();
      if(t.includes('save')||t.includes('sauvegarder')){click(btn);await sleep(600);return true;}
    }
    return false;
  }

  async function clickResume(){
    const btn=document.querySelector('button[aria-label="Resume"]')||[...document.querySelectorAll('button')].find(b=>/^resum/i.test(b.textContent.trim()));
    if(btn){btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));await sleep(800);return true;}
    return false;
  }

  async function fixTS(item){
    const el=[...item.querySelectorAll('[data-baseweb="typo-labelxsmall"]')].find(e=>/\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}/.test(e.textContent));
    if(!el) return;
    const m=el.textContent.match(/(\d{2}:\d{2}:\d{2})\s*-\s*(\d{2}:\d{2}:\d{2})/);
    if(!m||m[1]!==m[2]) return;
    const[h,min,sec]=m[2].split(':').map(Number);let ns=sec+1,nm=min,nh=h;
    if(ns>=60){ns=0;nm++;}if(nm>=60){nm=0;nh++;}
    const nEnd=[nh,nm,ns].map(v=>String(v).padStart(2,'0')).join(':');
    for(const inp of item.querySelectorAll('input[type="text"],input:not([type])')){
      if(inp.value===m[2]){
        const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
        s.call(inp,nEnd);inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));await sleep(200);return;
      }
    }
  }

  /* ---- Duration / Timer ---- */
  function readDur(){
    for(const el of document.querySelectorAll('[data-baseweb="typo-labelsmall"]')){
      const m=el.textContent.match(/[\d:]+\s*\/\s*([\d:]+)/);
      if(m) return m[1].trim();
    }
    return null;
  }

  function durToMs(str){
    const p=str.split(':').map(Number);
    if(p.length!==3) return 0;
    /* format MM:SS:CS — on utilise uniquement les minutes (p[0]) × 17 */
    return p[0]*60*1000;
  }

  /* MM:SS:cs format (minutes : seconds : centiseconds) */
  function fmtMs(ms){
    if(ms<=0) return '00:00:00';
    const totalSec=Math.floor(ms/1000);
    const h=Math.floor(totalSec/3600);
    const m=Math.floor((totalSec%3600)/60);
    const s=totalSec%60;
    return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  }

  function startTimer(ms,onDone){
    if(_submitTimer) clearInterval(_submitTimer);
    if(_countdownTimer) clearInterval(_countdownTimer);
    const dl=Date.now()+ms;
    const cntEl=document.getElementById('__AF_cnt');
    const cntW=document.getElementById('__AF_cntw');
    if(cntW) cntW.style.display='block';
    if(cntEl) cntEl.textContent=fmtMs(ms);
    _countdownTimer=setInterval(function(){
      const left=dl-Date.now();
      if(cntEl) cntEl.textContent=fmtMs(left>0?left:0);
      if(left<=0){clearInterval(_countdownTimer);_countdownTimer=null;}
    },100);
    _submitTimer=setInterval(async function(){
      await clickResume();
      if(Date.now()>=dl){
        clearInterval(_submitTimer);_submitTimer=null;
        clearInterval(_countdownTimer);_countdownTimer=null;
        if(cntEl) cntEl.textContent='00:00:00';
        if(cntW) cntW.style.display='none';
        const btn=document.querySelector('button[aria-label="Submit Task"]');
        if(btn) btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
        onDone();
      }
    },20000);
  }

  function stopAllTimers(){
    if(_submitTimer){clearInterval(_submitTimer);_submitTimer=null;}
    if(_countdownTimer){clearInterval(_countdownTimer);_countdownTimer=null;}
    const cntW=document.getElementById('__AF_cntw');
    const cntEl=document.getElementById('__AF_cnt');
    if(cntW) cntW.style.display='none';
    if(cntEl) cntEl.textContent='00:00:00';
  }

  /* ---- Process one annotation item ---- */
  async function processItem(item,cfg,i,tot,notify){
    await clickResume();
    item.scrollIntoView({behavior:'smooth',block:'center'});
    await sleep(400);
    const p=getTrP(item);
    const {words,plainText,taggedText,hasFrench}=analyzeSpans(p);
    if(!plainText){notify('progress',i+1,tot);return;}
    if(!clickEdit(item)){notify('progress',i+1,tot);return;}
    await sleep(500);
    for(let w=0;w<15&&!findDD('Primary Type',item);w++) await sleep(200);
    await fixTS(item);
    await fillDDs(hasFrench,item,item);
    const tf=await findByPH('transliteration',5000);
    if(tf){
      setField(tf,await buildTransliterationText(words));
      tf.setAttribute('dir','rtl');tf.style.direction='rtl';tf.style.textAlign='right';tf.style.unicodeBidi='embed';
      await sleep(300);
    }
    if(hasFrench){
      for(const ta of document.querySelectorAll('textarea')){
        if(ta!==tf){setReactTA(ta,taggedText);await sleep(200);break;}
      }
    }
    await save();
    notify('progress',i+1,tot);
    await sleep(cfg.delay||700);
  }

  /* ---- Resolve remaining items ---- */
  async function resolveRemainingItems(uiNotify){
    const remBtn=document.querySelector('button[aria-label="Remaining items"]');
    if(!remBtn){uiNotify('error','Bouton Remaining items introuvable.');return;}
    const badge=remBtn.querySelector('[data-baseweb="notification-badge"]');
    const total=parseInt(badge?badge.textContent:'0',10);
    if(total<=0){uiNotify('error','Aucun remaining item (badge = 0).');return;}
    click(remBtn);
    await sleep(800);
    const drawer=document.getElementById('modernization-side-drawer');
    if(!drawer){uiNotify('error','Drawer introuvable.');return;}
    let done=0,rounds=0;
    while(rounds++<100){
      if(stop) break;
      const confirmRead=document.querySelector('button[aria-label="Confirm Read"]');
      if(confirmRead){click(confirmRead);done=0;rounds=0;await sleep(800);continue;}
      const expandBtns=[...drawer.querySelectorAll('[data-testid="expand-button"]')];
      if(!expandBtns.length) break;
      click(expandBtns[0]);
      await sleep(600);
      const accepts=[...drawer.querySelectorAll('[data-testid="accept-button"]')];
      for(const ab of accepts){
        if(stop) return;
        click(ab);done++;
        const stEl=document.getElementById('__AF_st');
        if(stEl) stEl.textContent=done+' / ~'+total+' acceptés';
        await sleep(400);
      }
      await sleep(300);
    }
    uiNotify('done',done);
  }

  /* ---- Main run loop ---- */
  async function run(cfg,notify){
    await clickResume();
    const durStr=readDur();
    if(durStr){
      const ms=durToMs(durStr)*17;
      notify('timer',Math.round(ms/60000),durStr);
      startTimer(ms,function(){notify('submit');});
    }
    const list=document.querySelector('[data-testid="annotation-list"]');
    if(!list){notify('error','Liste introuvable.');return;}
    const items=[...list.querySelectorAll('[data-testid^="annotation-list-item-"]')];
    const tot=items.length;
    if(!tot){notify('error','Aucun item trouvé.');return;}
    for(let i=0;i<items.length;i++){
      if(stop){notify('stopped');return;}
      await processItem(items[i],cfg,i,tot,notify);
    }
    notify('done',tot);
  }

  /* ================================================================
     FLOATING PANEL
  ================================================================ */
  const panel=document.createElement('div');
  panel.id='__AF_panel';
  Object.assign(panel.style,{
    position:'fixed',top:'20px',right:'20px',width:'270px',
    background:'#0f0f1a',border:'1px solid #2d2d6b',borderRadius:'10px',
    padding:'13px',color:'#e2e8f0',
    fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    fontSize:'12px',zIndex:'2147483647',boxShadow:'0 8px 32px rgba(0,0,0,.6)',
    userSelect:'none'
  });

  panel.innerHTML=[
    /* drag bar */
    '<div id="__AF_drag" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #2d2d6b;cursor:grab;">',
      '<span style="font-size:10px;font-weight:700;color:#a78bfa;letter-spacing:1px;">&#9776; ANNOTATION AUTO-FILL</span>',
      '<button id="__AF_x" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:18px;line-height:1;padding:0 2px;">&times;</button>',
    '</div>',
    /* delay input */
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">',
      '<label style="font-size:10px;color:#94a3b8;font-weight:700;white-space:nowrap;">DÉLAI ms</label>',
      '<input id="__AF_delay" type="number" value="700" min="200" max="5000" step="100" style="width:70px;padding:4px 6px;background:#1a1a2e;border:1px solid #2d2d6b;border-radius:4px;color:#e2e8f0;font-size:11px;">',
    '</div>',
    /* start / stop */
    '<div style="display:flex;gap:8px;margin-bottom:8px;">',
      '<button id="__AF_go" style="flex:1;padding:8px;background:#7c3aed;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer;">&#9654; Start</button>',
      '<button id="__AF_stp" disabled style="flex:1;padding:8px;background:#1f2937;color:#6b7280;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer;">&#9632; Stop</button>',
    '</div>',
    /* remaining items */
    '<div style="margin-bottom:10px;">',
      '<button id="__AF_rem" style="width:100%;padding:7px;background:#1e3a5f;color:#93c5fd;border:1px solid #1d4ed8;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer;">&#9888; Remaining Items</button>',
    '</div>',
    /* countdown timer — hidden until timer starts */
    '<div id="__AF_cntw" style="display:none;text-align:center;background:#0a0a14;border:1px solid #2d2d6b;border-radius:6px;padding:6px 4px;margin-bottom:8px;">',
      '<div style="font-size:9px;color:#64748b;font-weight:700;letter-spacing:1px;margin-bottom:2px;">TEMPS RESTANT (hh:mm:ss)</div>',
      '<div id="__AF_cnt" style="font-size:26px;font-weight:700;color:#a78bfa;letter-spacing:3px;font-family:monospace;">00:00:00</div>',
    '</div>',
    /* progress bar */
    '<div id="__AF_bw" style="height:5px;background:#1a1a2e;border-radius:3px;overflow:hidden;margin-bottom:7px;display:none;">',
      '<div id="__AF_b" style="height:100%;width:0;background:linear-gradient(90deg,#7c3aed,#a78bfa);border-radius:3px;transition:width .3s;"></div>',
    '</div>',
    /* status text */
    '<div id="__AF_st" style="text-align:center;font-size:11px;color:#94a3b8;">Prêt</div>'
  ].join('');

  document.body.appendChild(panel);

  const stEl  = panel.querySelector('#__AF_st');
  const barEl = panel.querySelector('#__AF_b');
  const bwEl  = panel.querySelector('#__AF_bw');
  const goBtn = panel.querySelector('#__AF_go');
  const stpBtn= panel.querySelector('#__AF_stp');

  const uiSt = t => stEl.textContent = t;
  function uiRun(on){
    goBtn.disabled=on;
    stpBtn.disabled=!on;
    stpBtn.style.background=on?'#dc2626':'#1f2937';
    stpBtn.style.color=on?'#fff':'#6b7280';
  }
  function uiProg(c,t){
    bwEl.style.display='block';
    barEl.style.width=(t?(c/t)*100:0)+'%';
    uiSt(c+' / '+t);
  }

  function notify(type,a,b){
    if(type==='progress') uiProg(a,b);
    else if(type==='timer')   uiSt('⏱ '+a+' min ('+b+' × 17)');
    else if(type==='submit')  { stopAllTimers(); uiSt('Submit Task ✓'); uiRun(false); }
    else if(type==='error')   { uiSt('Erreur: '+a); uiRun(false); }
    else if(type==='done')    { uiProg(a,a); uiSt('Terminé ✓'); uiRun(false); }
    else if(type==='stopped') { uiSt('Arrêté'); uiRun(false); }
  }

  /* Start button — restarts automatically after Submit */
  goBtn.addEventListener('click', async function(){
    const delay=parseInt(panel.querySelector('#__AF_delay').value)||700;
    stop=false;
    const cfg={delay};
    async function doRun(){
      stopAllTimers();
      uiRun(true);
      uiSt('En cours…');
      bwEl.style.display='none';
      barEl.style.width='0';
      try {
        await run(cfg, function(type,a,b){
          if(type==='submit'){
            stopAllTimers();
            uiSt('Submit ✓ – Attente Confirm Read…');
            (async function waitConfirm(){
              while(!stop){
                const cr=document.querySelector('button[aria-label="Confirm Read"]');
                if(cr){
                  cr.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
                  uiSt('Confirm Read ✓ – Remaining Items…');
                  await sleep(1500);
                  if(stop){uiSt('Arrêté');uiRun(false);return;}
                  /* 1. Remaining Items */
                  try{await resolveRemainingItems(notify);}catch(e){}
                  if(stop){uiSt('Arrêté');uiRun(false);return;}
                  /* 2. Flash timer display 3× pour signaler nouveau cycle */
                  const cntW=document.getElementById('__AF_cntw');
                  const cntEl=document.getElementById('__AF_cnt');
                  if(cntW&&cntEl){
                    cntW.style.display='block';
                    for(let i=0;i<3;i++){
                      cntEl.style.opacity='0';await sleep(300);
                      cntEl.style.opacity='1';await sleep(300);
                    }
                  }
                  /* 3. Relancer le script */
                  if(!stop) await doRun();
                  else {uiSt('Arrêté');uiRun(false);}
                  return;
                }
                await sleep(500);
              }
              uiSt('Arrêté'); uiRun(false);
            })();
          } else {
            notify(type,a,b);
          }
        });
      } catch(e) {
        uiSt('Erreur: '+e.message);
        uiRun(false);
      }
    }
    await doRun();
  });

  /* Stop button */
  stpBtn.addEventListener('click', function(){
    stop=true;
    stopAllTimers();
    uiSt('Arrêt en cours…');
  });

  /* Remaining Items button */
  panel.querySelector('#__AF_rem').addEventListener('click', async function(){
    stop=false;
    uiRun(true);
    uiSt('Remaining items…');
    try { await resolveRemainingItems(notify); }
    catch(e) { uiSt('Erreur: '+e.message); uiRun(false); }
  });

  /* Close button */
  panel.querySelector('#__AF_x').addEventListener('click', function(){
    stop=true;
    stopAllTimers();
    panel.style.display='none';
  });

  /* Drag */
  const dh=panel.querySelector('#__AF_drag');
  let dg=false,ox=0,oy=0;
  dh.addEventListener('mousedown',function(e){
    if(e.target.id==='__AF_x') return;
    dg=true;
    const r=panel.getBoundingClientRect();
    ox=e.clientX-r.left; oy=e.clientY-r.top;
    dh.style.cursor='grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove',function(e){
    if(!dg) return;
    const x=Math.max(0,Math.min(window.innerWidth-panel.offsetWidth,e.clientX-ox));
    const y=Math.max(0,Math.min(window.innerHeight-panel.offsetHeight,e.clientY-oy));
    panel.style.left=x+'px'; panel.style.top=y+'px';
    panel.style.right='auto'; panel.style.bottom='auto';
  });
  document.addEventListener('mouseup',function(){dg=false;dh.style.cursor='grab';});

})();
