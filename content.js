(function () {
  const _ex = document.getElementById('__AF_panel');
  if (_ex) { _ex.style.display = ''; return; }

  let stop = false, _submitTimer = null, _countdownTimer = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---- Empêche la popup native "quitter le site ?" avant reload ---- */
  try { window.onbeforeunload = null; } catch (e) {}
  window.addEventListener('beforeunload', function (e) {
    e.stopImmediatePropagation();
    delete e.returnValue;
  }, true);

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
    el.focus();
    s.call(el,value);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.dispatchEvent(new FocusEvent('blur',{bubbles:true}));
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
      for(let attempt=0;attempt<4;attempt++){
        let tr=findDD(label,root);
        if(!tr){await sleep(300);continue;}
        if(tr.textContent.toLowerCase().includes(value.toLowerCase())) break;
        await pickOpt(tr,value);
        if(anchor) anchor.scrollIntoView({behavior:'smooth',block:'center'});
        await sleep(300);
        tr=findDD(label,root);
        if(tr&&tr.textContent.toLowerCase().includes(value.toLowerCase())) break;
      }
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

  function isDisabled(btn){return btn.disabled||btn.getAttribute('aria-disabled')==='true'||btn.getAttribute('data-disabled')==='true';}

  /* ---- Classification (speaker demographics) : sélectionne NA sur tous les champs éligibles ---- */
  function findClassificationPanel(){
    for(const lbl of document.querySelectorAll('[data-baseweb="typo-labelsmall"]')){
      if(lbl.textContent.trim().toLowerCase()!=='classification') continue;
      for(let anc=lbl.parentElement,d=0;anc&&d<8;anc=anc.parentElement,d++){
        if(anc.querySelector('li[data-baseweb="block"] [data-baseweb="typo-labelmedium"]')) return anc;
      }
    }
    return null;
  }

  function findNavBtn(panel,label){
    for(const btn of panel.querySelectorAll('button[data-baseweb="button"]')){
      const t=btn.querySelector('title');
      if(t&&t.textContent.trim().toLowerCase()===label.toLowerCase()) return btn;
    }
    return null;
  }

  function readClassifBadge(panel){
    for(const s of panel.querySelectorAll('span[title]')){
      const m=s.title.match(/(\d+)\s*\/\s*(\d+)/);
      if(m) return{cur:parseInt(m[1],10),total:parseInt(m[2],10)};
    }
    return null;
  }

  async function setNAOnClassification(panel){
    let count=0;
    for(const lbl of panel.querySelectorAll('[data-baseweb="typo-labelmedium"]')){
      const fieldLi=lbl.closest('li[data-baseweb="block"]');
      if(!fieldLi) continue;
      const options=[...fieldLi.querySelectorAll('li[answertextstyles]')];
      if(!options.length) continue;
      const naOpt=options.find(o=>o.textContent.trim().toUpperCase()==='NA');
      if(naOpt){click(naOpt);count++;await sleep(200);}
    }
    return count;
  }

  async function fillClassificationNA(notify){
    const panel=findClassificationPanel();
    if(!panel){notify('error','Panneau Classification introuvable.');return;}
    let guard=0,total=0;
    while(guard++<20){
      if(stop) break;
      total+=await setNAOnClassification(panel);
      const badge=readClassifBadge(panel);
      const nextBtn=findNavBtn(panel,'Next annotation');
      if(!nextBtn||isDisabled(nextBtn)) break;
      if(badge&&badge.cur>=badge.total) break;
      click(nextBtn);
      await sleep(500);
    }
    notify('classifDone',total,guard);
  }

  function findBtnByText(...labels){
    const btns=[...document.querySelectorAll('button[data-baseweb="button"]')];
    for(const label of labels){
      const found=btns.find(b=>b.textContent.trim().toLowerCase().includes(label));
      if(found) return found;
    }
    return null;
  }

  async function clickWhenEnabled(finder,ms=8000){
    const t0=Date.now();
    while(Date.now()-t0<ms){
      const btn=finder();
      if(btn&&!isDisabled(btn)){click(btn);await sleep(600);return true;}
      await sleep(250);
    }
    return false;
  }

  async function save(){
    return clickWhenEnabled(()=>findBtnByText('save changes','save','sauvegarder'));
  }

  async function clickApprove(){
    return clickWhenEnabled(()=>findBtnByText('approve'),5000);
  }

  function findResumeBtn(){
    return document.querySelector('button[aria-label="Resume"]')
      ||document.querySelector('button[aria-label="resume"]')
      ||[...document.querySelectorAll('button')].find(b=>/^resum/i.test(b.textContent.trim()));
  }

  async function clickResume(){
    let btn=findResumeBtn();
    if(!btn) return false;
    for(let i=0;i<4;i++){
      ['mousedown','mouseup','click'].forEach(t=>btn.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true})));
      await sleep(700);
      if(!findResumeBtn()) return true; // disappeared → success
      btn=findResumeBtn();
      if(!btn) return true;
      await sleep(400);
    }
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

  function startTimer(ms){
    if(_submitTimer) clearInterval(_submitTimer);
    if(_countdownTimer) clearInterval(_countdownTimer);
    const dl=Date.now()+ms;
    localStorage.setItem('__AF_deadline', String(dl));
    localStorage.setItem('__AF_onDoneKey','submit');
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
        localStorage.removeItem('__AF_deadline');
        if(stop) return;
        const stEl=document.getElementById('__AF_st');
        if(stEl) stEl.textContent='Remaining Items avant Submit…';
        try{
          await resolveRemainingItems(function(type,a){
            if(type==='done'&&stEl) stEl.textContent='Remaining Items traités ('+a+') — Submit…';
            else if(type==='error'&&stEl) stEl.textContent='Remaining Items: '+a;
          });
        }catch(e){}
        if(stop) return;
        await submitAndRelaunch();
      }
    },20000);
  }

  function stopAllTimers(){
    if(_submitTimer){clearInterval(_submitTimer);_submitTimer=null;}
    if(_countdownTimer){clearInterval(_countdownTimer);_countdownTimer=null;}
    localStorage.removeItem('__AF_deadline');
    localStorage.removeItem('__AF_onDoneKey');
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
    if(!clickEdit(item)){notify('progress',i+1,tot);return;}
    await sleep(500);
    for(let w=0;w<15&&!findDD('Primary Type',item);w++) await sleep(200);
    await fixTS(item);
    const tf=await findByPH('transliteration',5000);
    if(!plainText){
      for(const ta of document.querySelectorAll('textarea')){
        if(ta!==tf){setReactTA(ta,'.');await sleep(200);break;}
      }
    }
    await fillDDs(hasFrench,item,item);
    if(plainText){
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
    }
    await save();
    await clickApprove();
    notify('progress',i+1,tot);
    await sleep(cfg.delay||700);
  }

  /* ---- Vérifie les slots vides (transcription + dropdowns) sans les remplir ---- */
  async function verifySlots(notify){
    const list=document.querySelector('[data-testid="annotation-list"]');
    if(!list){notify('error','Liste introuvable.');return;}
    const items=[...list.querySelectorAll('[data-testid^="annotation-list-item-"]')];
    const tot=items.length;
    if(!tot){notify('error','Aucun item trouvé.');return;}
    const ddLabels=['Primary Type','Loudness Level','Segment Primary Language','Segment Secondary Language'];
    const issues=[];
    for(let i=0;i<items.length;i++){
      if(stop){notify('stopped');return;}
      const item=items[i];
      await clickResume();
      item.scrollIntoView({behavior:'smooth',block:'center'});
      await sleep(300);
      const p=getTrP(item);
      const{plainText}=analyzeSpans(p);
      const itemIssues=[];
      if(!plainText) itemIssues.push('Transcription vide');
      const wasEdit=clickEdit(item);
      if(wasEdit){
        for(let w=0;w<15&&!findDD('Primary Type',item);w++) await sleep(200);
        for(const label of ddLabels){
          const tr=findDD(label,item);
          const txt=tr?tr.textContent.trim().toLowerCase():'';
          if(!tr||!txt||txt.includes('select a value')) itemIssues.push(label);
        }
        clickEdit(item); // referme si le bouton reste libellé "Edit" (toggle)
        await sleep(200);
      } else {
        itemIssues.push('Edit introuvable');
      }
      if(itemIssues.length) issues.push({index:i+1,issues:itemIssues});
      notify('progress',i+1,tot);
    }
    notify('verifyDone',issues,tot);
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
    let durStr=readDur();
    for(let w=0;w<20&&!durStr;w++){await sleep(300);await clickResume();durStr=readDur();}
    if(durStr){
      const mult=cfg.multiplier||17;
      const ms=durToMs(durStr)*mult;
      notify('timer',Math.round(ms/60000),durStr,mult);
      startTimer(ms);
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
    if(_submitTimer) notify('waiting',tot);
    else notify('done',tot);
  }

  /* ================================================================
     FLOATING PANEL
  ================================================================ */
  const panel=document.createElement('div');
  panel.id='__AF_panel';
  Object.assign(panel.style,{
    position:'fixed',top:'20px',right:'20px',width:'296px',
    background:'#0f0f1a',border:'1px solid #2d2d6b',borderRadius:'10px',
    padding:'13px',color:'#e2e8f0',
    fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    fontSize:'12px',zIndex:'2147483647',boxShadow:'0 8px 32px rgba(0,0,0,.6)',
    userSelect:'none'
  });

  function sectionLbl(text){
    return '<div style="font-size:9px;font-weight:700;color:#64748b;letter-spacing:1.5px;margin:12px 0 6px;">'+text+'</div>';
  }
  function toolBtn(id,icon,label,color,accent,title){
    return '<button id="'+id+'" title="'+title+'" style="padding:7px 6px;background:#14141f;color:'+color+';border:1px solid #23233a;border-left:3px solid '+accent+';border-radius:5px;font-size:10.5px;font-weight:700;cursor:pointer;text-align:left;line-height:1.25;">'+icon+' '+label+'</button>';
  }

  panel.innerHTML=[
    /* drag bar */
    '<div id="__AF_drag" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #2d2d6b;cursor:grab;">',
      '<span style="font-size:10px;font-weight:700;color:#a78bfa;letter-spacing:1px;">&#9776; ANNOTATION AUTO-FILL</span>',
      '<button id="__AF_x" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:18px;line-height:1;padding:0 2px;">&times;</button>',
    '</div>',

    sectionLbl('RÉGLAGES'),
    /* delay input */
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">',
      '<label style="font-size:10px;color:#94a3b8;font-weight:700;white-space:nowrap;">DÉLAI ms</label>',
      '<input id="__AF_delay" type="number" value="700" min="200" max="5000" step="100" style="width:70px;padding:4px 6px;background:#1a1a2e;border:1px solid #2d2d6b;border-radius:4px;color:#e2e8f0;font-size:11px;">',
    '</div>',
    /* editor / reviewer mode */
    '<div style="display:flex;gap:6px;">',
      '<label id="__AF_mode_editor_lbl" style="flex:1;text-align:center;padding:6px 4px;background:#7c3aed;border:1px solid #7c3aed;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;color:#fff;">',
        '<input type="radio" name="__AF_mode" id="__AF_mode_editor" value="17" checked style="display:none;">Editor (×17)',
      '</label>',
      '<label id="__AF_mode_reviewer_lbl" style="flex:1;text-align:center;padding:6px 4px;background:#1a1a2e;border:1px solid #2d2d6b;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;color:#94a3b8;">',
        '<input type="radio" name="__AF_mode" id="__AF_mode_reviewer" value="10" style="display:none;">Reviewer (×10)',
      '</label>',
    '</div>',

    sectionLbl('ACTIONS'),
    /* start / stop */
    '<div style="display:flex;gap:8px;">',
      '<button id="__AF_go" style="flex:1;padding:9px;background:#7c3aed;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer;">&#9654; Start</button>',
      '<button id="__AF_stp" disabled style="flex:1;padding:9px;background:#1f2937;color:#6b7280;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer;">&#9632; Stop</button>',
    '</div>',

    sectionLbl('OUTILS'),
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:4px;">',
      toolBtn('__AF_rem','&#9888;','Remaining Items','#93c5fd','#1d4ed8','Traite les items restants puis relance le Submit'),
      toolBtn('__AF_verify','&#128269;','Vérifier Slots','#86efac','#15803d','Scanne transcription + dropdowns vides sans les modifier'),
      toolBtn('__AF_classif','&#127991;','Classif. &rarr; NA','#e9a8f5','#862d86','Sélectionne NA sur les champs de classification pour tous les speakers'),
      toolBtn('__AF_testreload','&#8635;','Test Reload','#fbbf24','#92400e','Recharge la page pour vérifier que la popup native n’apparaît pas'),
    '</div>',

    /* countdown timer — hidden until timer starts */
    '<div id="__AF_cntw" style="display:none;text-align:center;background:#0a0a14;border:1px solid #2d2d6b;border-radius:6px;padding:6px 4px;margin-top:10px;">',
      '<div style="font-size:9px;color:#64748b;font-weight:700;letter-spacing:1px;margin-bottom:2px;">TEMPS RESTANT (hh:mm:ss)</div>',
      '<div id="__AF_cnt" style="font-size:26px;font-weight:700;color:#a78bfa;letter-spacing:3px;font-family:monospace;">00:00:00</div>',
    '</div>',
    /* progress bar */
    '<div id="__AF_bw" style="height:5px;background:#1a1a2e;border-radius:3px;overflow:hidden;margin:10px 0 7px;display:none;">',
      '<div id="__AF_b" style="height:100%;width:0;background:linear-gradient(90deg,#7c3aed,#a78bfa);border-radius:3px;transition:width .3s;"></div>',
    '</div>',
    /* status text */
    '<div id="__AF_st" style="text-align:center;font-size:11px;color:#94a3b8;margin-top:6px;">Prêt</div>'
  ].join('');

  document.body.appendChild(panel);

  const stEl  = panel.querySelector('#__AF_st');
  const barEl = panel.querySelector('#__AF_b');
  const bwEl  = panel.querySelector('#__AF_bw');
  const goBtn = panel.querySelector('#__AF_go');
  const stpBtn= panel.querySelector('#__AF_stp');
  const editorLbl   = panel.querySelector('#__AF_mode_editor_lbl');
  const reviewerLbl = panel.querySelector('#__AF_mode_reviewer_lbl');

  function getMultiplier(){
    const checked=panel.querySelector('input[name="__AF_mode"]:checked');
    return checked?parseInt(checked.value,10):17;
  }
  function refreshModeUI(){
    const isEditor=getMultiplier()===17;
    editorLbl.style.background=isEditor?'#7c3aed':'#1a1a2e';
    editorLbl.style.borderColor=isEditor?'#7c3aed':'#2d2d6b';
    editorLbl.style.color=isEditor?'#fff':'#94a3b8';
    reviewerLbl.style.background=isEditor?'#1a1a2e':'#7c3aed';
    reviewerLbl.style.borderColor=isEditor?'#2d2d6b':'#7c3aed';
    reviewerLbl.style.color=isEditor?'#94a3b8':'#fff';
  }
  panel.querySelectorAll('input[name="__AF_mode"]').forEach(r=>r.addEventListener('change',refreshModeUI));

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

  function notify(type,a,b,c){
    if(type==='progress') uiProg(a,b);
    else if(type==='timer')   uiSt('⏱ '+a+' min ('+b+' × '+(c||17)+')');
    else if(type==='error')   { uiSt('Erreur: '+a); uiRun(false); }
    else if(type==='done')    { uiProg(a,a); uiSt('Terminé ✓'); uiRun(false); }
    else if(type==='stopped') { uiSt('Arrêté'); uiRun(false); }
    else if(type==='verifyDone') {
      uiRun(false);
      if(!a.length){ uiSt('✓ Vérif OK — aucun slot vide ('+b+' items)'); }
      else {
        console.log('[AutoFill] Slots vides détectés:', a);
        const preview=a.slice(0,3).map(it=>'#'+it.index+': '+it.issues.join('/')).join(' | ');
        uiSt(a.length+'/'+b+' item(s) incomplet(s) — '+preview+(a.length>3?' … (console)':''));
      }
    }
    else if(type==='classifDone') {
      uiRun(false);
      uiSt('✓ Classification: NA sélectionné sur '+a+' champ(s), '+b+' speaker(s) traité(s)');
    }
  }

  /* ── Enchaîne Submit Task → Confirm Read → relance auto ── */
  async function submitAndRelaunch(){
    const clicked=await clickWhenEnabled(()=>document.querySelector('button[aria-label="Submit Task"]'),15000);
    if(!clicked){uiSt('Submit Task introuvable/désactivé');uiRun(false);return;}
    uiSt('Submit ✓ – Attente Confirm Read…');
    let g=0;
    while(g++<240&&!stop){
      const cr=document.querySelector('button[aria-label="Confirm Read"]');
      if(cr){
        ['mousedown','mouseup','click'].forEach(t=>cr.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true})));
        uiSt('Confirm Read ✓');
        await sleep(1500);
        if(stop){uiSt('Arrêté');uiRun(false);return;}
        const cntW=document.getElementById('__AF_cntw');
        const cntEl=document.getElementById('__AF_cnt');
        if(cntW&&cntEl){
          cntW.style.display='block';
          for(let i=0;i<3;i++){
            cntEl.style.opacity='0';await sleep(300);
            cntEl.style.opacity='1';await sleep(300);
          }
        }
        uiRun(false);
        uiSt('⟳ Relance automatique…');
        goBtn.click();
        return;
      }
      await sleep(500);
    }
    uiSt('Terminé');
    uiRun(false);
  }

  /* Start button — la boucle se relance seule après Submit (via reload) */
  goBtn.addEventListener('click', async function(){
    const delay=parseInt(panel.querySelector('#__AF_delay').value)||700;
    stop=false;
    const cfg={delay,multiplier:getMultiplier()};
    stopAllTimers();
    uiRun(true);
    uiSt('En cours…');
    bwEl.style.display='none';
    barEl.style.width='0';
    try {
      await run(cfg, notify);
    } catch(e) {
      uiSt('Erreur: '+e.message);
      uiRun(false);
    }
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
    try {
      await resolveRemainingItems(notify);
      if(stop) return;
      await submitAndRelaunch();
    }
    catch(e) { uiSt('Erreur: '+e.message); uiRun(false); }
  });

  /* Vérifier Slots Vides — parcourt tous les items et signale transcription/dropdowns vides */
  panel.querySelector('#__AF_verify').addEventListener('click', async function(){
    stop=false;
    uiRun(true);
    uiSt('Vérification en cours…');
    bwEl.style.display='none';
    barEl.style.width='0';
    try { await verifySlots(notify); }
    catch(e) { uiSt('Erreur: '+e.message); uiRun(false); }
  });

  /* Classification -> NA */
  panel.querySelector('#__AF_classif').addEventListener('click', async function(){
    stop=false;
    uiRun(true);
    uiSt('Classification en cours…');
    try { await fillClassificationNA(notify); }
    catch(e) { uiSt('Erreur: '+e.message); uiRun(false); }
  });

  /* Test Reload — vérifie que le reload ne déclenche pas la popup native "quitter le site" */
  panel.querySelector('#__AF_testreload').addEventListener('click', function(){
    localStorage.setItem('__AF_testReload','1');
    location.reload();
  });

  /* Close button */
  panel.querySelector('#__AF_x').addEventListener('click', function(){
    stop=true;
    stopAllTimers();
    panel.style.display='none';
  });

  /* ── Auto-click Resume à chaque refresh, même si le script est arrêté ── */
  setInterval(function(){
    const btn=findResumeBtn();
    if(btn) click(btn);
  }, 3000);

  /* ── Restore timer after page refresh ── */
  (function restoreTimer(){
    const saved=parseInt(localStorage.getItem('__AF_deadline')||'0',10);
    if(!saved) return;
    const remaining=saved-Date.now();
    if(remaining<=0){localStorage.removeItem('__AF_deadline');return;}
    uiRun(true);
    uiSt('⟳ Timer restauré: '+fmtMs(remaining));
    startTimer(remaining);
  })();

  /* ── Confirme visuellement que le reload de test n'a pas déclenché la popup native ── */
  if (localStorage.getItem('__AF_testReload') === '1') {
    localStorage.removeItem('__AF_testReload');
    uiSt('✓ Reload OK — aucune popup native');
  }

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
