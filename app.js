(function(){
  "use strict";

  var STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.6L22 9.3l-5 4.9 1.2 7.1L12 17.8l-6.2 3.5L7 14.2 2 9.3l7.1-.7L12 2Z"/></svg>';
  var SPEAK_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M4 9v6h4l5 4V5L8 9H4Z"/></svg><svg viewBox="0 0 24 24" style="margin-left:-14px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>';
  var CATEGORIES = ['All','Everyday','Academic','Business','Nature','Emotions','Slang','Looked up'];
  var DIFFICULTIES = ['All','Easy','Medium','Hard'];

  // ---------- helpers ----------
  function todayKey(d){
    d = d || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth()+1).padStart(2,'0');
    var day = String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+day;
  }
  function escapeHTML(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function shuffle(arr){
    for(var i=arr.length-1;i>0;i--){
      var j=Math.floor(Math.random()*(i+1));
      var t=arr[i]; arr[i]=arr[j]; arr[j]=t;
    }
    return arr;
  }

  // ---------- state ----------
  function defaultState(){
    return {
      collection: {},
      favorites: {},
      lookupCache: {},
      progress: {},
      stats: { streak:0, longestStreak:0, lastActiveDate:null, quizTotal:0, quizCorrect:0 },
      wordOfDay: null,
      accent: 'uk'
    };
  }
  var state = defaultState();

  function loadState(){
    try{
      var raw = localStorage.getItem('iwe-data');
      if(raw){
        var parsed = JSON.parse(raw);
        state = Object.assign(defaultState(), parsed);
        if(!state.collection) state.collection = {};
        if(!state.favorites) state.favorites = {};
        if(!state.lookupCache) state.lookupCache = {};
        if(!state.progress) state.progress = {};
        if(!state.stats) state.stats = defaultState().stats;
      }
    }catch(e){ /* first run */ }
  }
  function saveState(){
    try{ localStorage.setItem('iwe-data', JSON.stringify(state)); }catch(e){}
  }
  function ensureStarterWords(){
    STARTER_WORDS.forEach(function(w){
      var key = w.word.toLowerCase();
      if(!state.collection[key]){
        state.collection[key] = {
          word:w.word, pos:w.pos, definition:w.definition, example:w.example||'',
          category:w.category, difficulty:w.difficulty, isSlang: !!w.isSlang,
          derivation:w.derivation||'', usSpelling:w.usSpelling||'', source:'starter'
        };
      }
    });
  }

  function getDisplayStreak(){
    var today = todayKey();
    var y = new Date(); y.setDate(y.getDate()-1);
    var yesterday = todayKey(y);
    if(state.stats.lastActiveDate===today || state.stats.lastActiveDate===yesterday) return state.stats.streak;
    return 0;
  }
  function markActivity(){
    var today = todayKey();
    if(state.stats.lastActiveDate === today) return;
    var y = new Date(); y.setDate(y.getDate()-1);
    var yesterday = todayKey(y);
    state.stats.streak = (state.stats.lastActiveDate === yesterday) ? state.stats.streak + 1 : 1;
    state.stats.lastActiveDate = today;
    if(state.stats.streak > state.stats.longestStreak) state.stats.longestStreak = state.stats.streak;
    saveState();
    renderStreakBadge();
    updateOwlMood();
  }

  function pickWordOfDay(){
    var key = todayKey();
    if(state.wordOfDay && state.wordOfDay.date === key && state.collection[state.wordOfDay.key]) return state.wordOfDay.key;
    var pool = Object.keys(state.collection).sort();
    if(pool.length===0) return null;
    var hash = 0;
    for(var i=0;i<key.length;i++) hash = (hash*31 + key.charCodeAt(i)) >>> 0;
    var idx = hash % pool.length;
    state.wordOfDay = { date:key, key:pool[idx] };
    saveState();
    return pool[idx];
  }

  var FEMALE_NAME_HINTS = ['female','samantha','kate','serena','zira','hazel','victoria','fiona','moira','tessa','karen','susan','allison','ava','emma','joanna','salli','kimberly','amy','google uk english female','google us english'];

  function pickVoice(langPrefix){
    if(!('speechSynthesis' in window)) return null;
    var voices = window.speechSynthesis.getVoices() || [];
    if(voices.length === 0) return null;
    var inLang = voices.filter(function(v){ return v.lang && v.lang.toLowerCase().indexOf(langPrefix.toLowerCase()) === 0; });
    var pool = inLang.length ? inLang : voices.filter(function(v){ return v.lang && v.lang.toLowerCase().indexOf('en') === 0; });
    if(pool.length === 0) pool = voices;
    var female = pool.filter(function(v){
      var n = v.name.toLowerCase();
      return FEMALE_NAME_HINTS.some(function(hint){ return n.indexOf(hint) !== -1; });
    });
    return female[0] || pool[0];
  }
  // Some browsers populate the voice list asynchronously; this just
  // warms it up so the first pronunciation tap has voices ready.
  if('speechSynthesis' in window){
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = function(){ window.speechSynthesis.getVoices(); };
  }

  function speak(key){
    var w = state.collection[key] || state.lookupCache[key];
    if(!w || !('speechSynthesis' in window)) return;
    var u = new SpeechSynthesisUtterance(w.word);
    u.rate = 0.9;
    var langPrefix = state.accent === 'us' ? 'en-US' : 'en-GB';
    var voice = pickVoice(langPrefix);
    if(voice){ u.voice = voice; u.lang = voice.lang; } else { u.lang = langPrefix; }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
  function setAccent(a){
    state.accent = a;
    saveState();
    var btn = document.getElementById('accentToggle');
    if(btn) btn.textContent = a === 'us' ? 'US' : 'UK';
  }
  function toggleFavorite(key){
    if(!state.collection[key]) return;
    state.favorites[key] = !state.favorites[key];
    saveState();
    rerenderActive();
  }
  function addToCollection(key){
    var w = state.lookupCache[key];
    if(!w) return;
    state.collection[key] = w;
    saveState();
    renderDictResult(Object.assign({key:key}, w), true);
  }
  function rerenderActive(){
    var active = document.querySelector('.view.active');
    if(!active) return;
    if(active.id==='view-home') renderHome();
    else if(active.id==='view-mywords') renderMyWords();
  }

  // ---------- specimen card ----------
  function specimenHTML(w, opts){
    opts = opts || {};
    var tags = '<span class="tag cat">'+escapeHTML(w.category)+'</span>' +
      '<span class="tag diff-'+w.difficulty+'">'+w.difficulty+'</span>' +
      (w.isSlang ? '<span class="tag slang">Slang</span>' : '');
    var derivation = (w.isSlang && w.derivation) ?
      '<div class="derivation">Where it comes from: '+escapeHTML(w.derivation)+'</div>' : '';
    var phon = '';
    if(w.phoneticUK || w.phoneticUS){
      if(w.phoneticUK && w.phoneticUS && w.phoneticUK !== w.phoneticUS){
        phon = '<div class="phonetic"><span class="acc-tag">UK</span>'+escapeHTML(w.phoneticUK)+' <span class="acc-tag">US</span>'+escapeHTML(w.phoneticUS)+'</div>';
      } else {
        phon = '<div class="phonetic">'+escapeHTML(w.phoneticUK || w.phoneticUS)+'</div>';
      }
    }
    var variant = w.usSpelling ? '<div class="variant"><span class="acc-tag">US</span>'+escapeHTML(w.usSpelling)+'</div>' : '';
    var actions = '<div class="actions">';
    if(opts.showSpeak) actions += '<button class="icon-btn" data-say="'+w.key+'" aria-label="Pronounce">'+SPEAK_SVG+'</button>';
    if(opts.showFav) actions += '<button class="icon-btn'+(state.favorites[w.key]?' on':'')+'" data-fav="'+w.key+'" aria-label="Favorite">'+STAR_SVG+'</button>';
    if(opts.showAdd) actions += '<button class="pill-btn" data-add="'+w.key+'">Add to My Words</button>';
    actions += '</div>';
    return '<div class="row1"><div><div class="word">'+escapeHTML(w.word)+'</div><div class="pos">'+escapeHTML(w.pos||'')+'</div>'+phon+'</div></div>' +
      '<div class="tags">'+tags+'</div>' +
      '<div class="def">'+escapeHTML(w.definition)+'</div>' +
      (w.example ? '<div class="example">\u201c'+escapeHTML(w.example)+'\u201d</div>' : '') +
      variant + derivation + actions;
  }

  // ---------- HOME ----------
  function renderHome(){
    var key = pickWordOfDay();
    var card = document.getElementById('wordOfDayCard');
    if(!key){
      card.outerHTML = '<div class="empty-state" id="wordOfDayCard">No words yet. Look one up in Dictionary to get started.</div>';
    } else {
      var w = Object.assign({key:key}, state.collection[key]);
      card.className = 'specimen';
      card.innerHTML = specimenHTML(w, {showSpeak:true, showFav:true});
    }
    document.getElementById('statSaved').textContent = Object.keys(state.collection).length;
    document.getElementById('statAccuracy').textContent = state.stats.quizTotal ? Math.round(state.stats.quizCorrect/state.stats.quizTotal*100)+'%' : '\u2014';
    document.getElementById('statStreak').textContent = state.stats.longestStreak;
    renderStreakBadge();
    updateOwlMood();
  }
  function renderStreakBadge(){
    document.getElementById('streakCount').textContent = getDisplayStreak();
  }
  function updateOwlMood(){
    var s = getDisplayStreak();
    var owl = document.getElementById('homeOwl');
    owl.classList.remove('sleepy','excited');
    if(s===0) owl.classList.add('sleepy');
    else if(s>=3) owl.classList.add('excited');
  }

  // ---------- FLASHCARDS ----------
  var cardSession = { queue:null, index:0, flipped:false, knownCount:0 };
  function startCardSession(){
    var pool = Object.keys(state.collection);
    if(pool.length===0){ cardSession.queue=null; renderCards(); return; }
    cardSession.queue = shuffle(pool.slice());
    cardSession.index = 0; cardSession.flipped=false; cardSession.knownCount=0;
    renderCards();
  }
  function renderCards(){
    var stage = document.getElementById('cardsStage');
    if(!cardSession.queue){
      stage.innerHTML = '<div class="empty-state">No words saved yet. Look some up in Dictionary first, then come back to practice.</div>';
      return;
    }
    if(cardSession.index >= cardSession.queue.length){
      stage.innerHTML = '<div class="session-summary"><div class="big">'+cardSession.knownCount+' / '+cardSession.queue.length+'</div>' +
        '<div style="color:var(--ink-soft);font-weight:600;margin-top:4px;">words you knew</div>' +
        '<button class="pill-btn" id="cardsAgainBtn" style="margin-top:18px;width:100%;">Practice again</button></div>';
      return;
    }
    var key = cardSession.queue[cardSession.index];
    var w = state.collection[key];
    var html = '<div class="card-counter">Card '+(cardSession.index+1)+' of '+cardSession.queue.length+'</div>';
    html += '<div class="flashcard" id="flashcardEl">';
    if(!cardSession.flipped){
      html += '<div class="front-word">'+escapeHTML(w.word)+'</div><div class="hint">Tap to reveal</div>';
    } else {
      html += '<div class="front-word" style="font-size:22px;">'+escapeHTML(w.word)+'</div>';
      html += '<div class="def">'+escapeHTML(w.definition)+'</div>';
      if(w.example) html += '<div class="example">\u201c'+escapeHTML(w.example)+'\u201d</div>';
    }
    html += '</div>';
    if(cardSession.flipped){
      html += '<div class="judge-row"><button class="judge-btn learning" data-judge="learning">Still learning</button><button class="judge-btn knew" data-judge="knew">Got it</button></div>';
    }
    stage.innerHTML = html;
  }
  function judgeCard(result){
    var key = cardSession.queue[cardSession.index];
    if(!state.progress[key]) state.progress[key] = {seen:0,correct:0,wrong:0,known:false};
    state.progress[key].seen++;
    if(result==='knew'){ state.progress[key].correct++; state.progress[key].known=true; cardSession.knownCount++; }
    else { state.progress[key].wrong++; state.progress[key].known=false; }
    saveState();
    markActivity();
    cardSession.index++;
    cardSession.flipped=false;
    renderCards();
  }

  // ---------- QUIZ ----------
  var quizSession = { questions:null, index:0, correct:0, answered:false };
  function buildQuiz(){
    var pool = Object.keys(state.collection);
    if(pool.length < 4) return null;
    var shuffled = shuffle(pool.slice());
    var n = Math.min(8, shuffled.length);
    var qs = [];
    for(var i=0;i<n;i++){
      var correctKey = shuffled[i];
      var correctWord = state.collection[correctKey];
      var distractorPool = shuffle(pool.filter(function(k){ return k!==correctKey; }));
      var distractors = distractorPool.slice(0,3).map(function(k){ return state.collection[k].definition; });
      qs.push({ key:correctKey, word:correctWord.word, correctDef:correctWord.definition,
        options: shuffle([correctWord.definition].concat(distractors)) });
    }
    return qs;
  }
  function startQuiz(){
    quizSession.questions = buildQuiz();
    quizSession.index = 0; quizSession.correct = 0; quizSession.answered = false;
    renderQuiz();
  }
  function renderQuiz(){
    var stage = document.getElementById('quizStage');
    if(!quizSession.questions){
      stage.innerHTML = '<div class="empty-state">Add at least 4 words to unlock the quiz. The starter words already count, so look one more up in Dictionary if needed.</div>';
      return;
    }
    if(quizSession.index >= quizSession.questions.length){
      var pct = Math.round(quizSession.correct/quizSession.questions.length*100);
      stage.innerHTML = '<div class="session-summary"><div class="big">'+pct+'%</div>' +
        '<div style="color:var(--ink-soft);font-weight:600;margin-top:4px;">'+quizSession.correct+' of '+quizSession.questions.length+' correct</div>' +
        '<button class="pill-btn" id="quizAgainBtn" style="margin-top:18px;width:100%;">Try again</button></div>';
      return;
    }
    var q = quizSession.questions[quizSession.index];
    var dots = '';
    for(var i=0;i<quizSession.questions.length;i++) dots += '<i class="'+(i<quizSession.index?'done':'')+'"></i>';
    var html = '<div class="quiz-progress">'+dots+'</div><div class="quiz-q">'+escapeHTML(q.word)+'</div><div class="quiz-options">';
    q.options.forEach(function(opt, i){
      html += '<button class="opt-btn" data-quiz-opt="'+i+'">'+escapeHTML(opt)+'</button>';
    });
    html += '</div>';
    stage.innerHTML = html;
  }
  function answerQuiz(idx){
    if(quizSession.answered) return;
    quizSession.answered = true;
    var q = quizSession.questions[quizSession.index];
    var buttons = document.querySelectorAll('.opt-btn');
    var correct = q.options[idx] === q.correctDef;
    buttons.forEach(function(b,i){
      b.disabled = true;
      if(q.options[i]===q.correctDef) b.classList.add('correct');
      else if(i===idx) b.classList.add('wrong');
    });
    if(correct) quizSession.correct++;
    if(!state.progress[q.key]) state.progress[q.key] = {seen:0,correct:0,wrong:0,known:false};
    state.progress[q.key].seen++;
    if(correct) state.progress[q.key].correct++; else state.progress[q.key].wrong++;
    state.stats.quizTotal++;
    if(correct) state.stats.quizCorrect++;
    saveState();
    markActivity();
    setTimeout(function(){
      quizSession.index++;
      quizSession.answered = false;
      renderQuiz();
    }, 1000);
  }

  // ---------- DICTIONARY ----------
  function parseApiResult(key, data){
    var entry = data[0] || {};
    var meaning = (entry.meanings && entry.meanings[0]) || {};
    var def = (meaning.definitions && meaning.definitions[0]) || {};
    var phoneticUK = '', phoneticUS = '';
    (entry.phonetics || []).forEach(function(p){
      if(!p.text) return;
      var src = (p.audio || '').toLowerCase();
      if(src.indexOf('-uk') !== -1 || src.indexOf('_gb') !== -1) phoneticUK = p.text;
      else if(src.indexOf('-us') !== -1) phoneticUS = p.text;
    });
    if(!phoneticUK && !phoneticUS && entry.phonetic) phoneticUK = phoneticUS = entry.phonetic;
    return {
      word: entry.word || key,
      pos: meaning.partOfSpeech || '\u2014',
      definition: def.definition || 'No definition available.',
      example: def.example || '',
      phoneticUK: phoneticUK,
      phoneticUS: phoneticUS,
      category: 'Looked up',
      difficulty: 'Medium',
      isSlang: false,
      derivation: '',
      source: 'api'
    };
  }
  function renderDictResult(w, alreadySaved){
    document.getElementById('dictResult').innerHTML =
      '<div class="specimen">' + specimenHTML(w, {showSpeak:true, showFav:alreadySaved, showAdd:!alreadySaved}) + '</div>';
  }
  function doSearch(){
    var raw = (document.getElementById('dictInput').value||'').trim();
    if(!raw) return;
    var key = raw.toLowerCase();
    Object.keys(state.collection).forEach(function(k){
      if(state.collection[k].usSpelling && state.collection[k].usSpelling.toLowerCase() === key) key = k;
    });
    var statusEl = document.getElementById('dictStatus');
    statusEl.className = 'status-line'; statusEl.textContent = '';
    document.getElementById('dictResult').innerHTML = '';

    if(state.collection[key]){ renderDictResult(Object.assign({key:key}, state.collection[key]), true); return; }
    if(state.lookupCache[key]){ renderDictResult(Object.assign({key:key}, state.lookupCache[key]), false); return; }
    if(!navigator.onLine){
      statusEl.className = 'status-line err';
      statusEl.textContent = "You're offline, and this word hasn't been looked up before. Try again once you have a connection.";
      return;
    }
    statusEl.textContent = 'Looking up \u201c'+raw+'\u201d\u2026';
    var isFileProtocol = window.location.protocol === 'file:';
    fetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(key))
      .then(function(res){ if(!res.ok) throw new Error('not found'); return res.json(); })
      .then(function(data){
        var parsed = parseApiResult(key, data);
        state.lookupCache[key] = parsed;
        saveState();
        statusEl.textContent = '';
        renderDictResult(Object.assign({key:key}, parsed), false);
      })
      .catch(function(){
        statusEl.className = 'status-line err';
        if(isFileProtocol){
          statusEl.textContent = 'Dictionary lookups need a real web address to work. Opening this file directly (file://) blocks that request in most browsers. Test it through a local server (e.g. VS Code\u2019s Live Server, or "npx serve") or your deployed link instead.';
        } else {
          statusEl.textContent = 'No dictionary entry found for \u201c'+raw+'.\u201d Check the spelling, or use My Words to add it yourself as slang.';
        }
      });
  }

  // ---------- MY WORDS ----------
  var myWordsFilter = { category:'All', difficulty:'All', favoritesOnly:false };
  function renderChips(){
    document.getElementById('categoryChips').innerHTML =
      CATEGORIES.map(function(c){ return '<button class="chip'+(myWordsFilter.category===c?' active':'')+'" data-cat-chip="'+c+'">'+c+'</button>'; }).join('') +
      '<button class="chip'+(myWordsFilter.favoritesOnly?' active':'')+'" data-fav-chip="1">\u2605 Favorites</button>';
    document.getElementById('difficultyChips').innerHTML =
      DIFFICULTIES.map(function(d){ return '<button class="chip'+(myWordsFilter.difficulty===d?' active':'')+'" data-diff-chip="'+d+'">'+d+'</button>'; }).join('');
  }
  function renderMyWords(){
    renderChips();
    var q = (document.getElementById('myWordsSearch').value||'').toLowerCase();
    var listEl = document.getElementById('myWordsList');
    var keys = Object.keys(state.collection).sort();
    var filtered = keys.filter(function(k){
      var w = state.collection[k];
      if(myWordsFilter.category!=='All' && w.category!==myWordsFilter.category) return false;
      if(myWordsFilter.difficulty!=='All' && w.difficulty!==myWordsFilter.difficulty) return false;
      if(myWordsFilter.favoritesOnly && !state.favorites[k]) return false;
      if(q && k.indexOf(q)===-1 && (w.usSpelling||'').toLowerCase().indexOf(q)===-1 && w.definition.toLowerCase().indexOf(q)===-1) return false;
      return true;
    });
    if(filtered.length===0){
      listEl.innerHTML = '<div class="empty-state">No words match. Try a different filter, or look one up in Dictionary.</div>';
      return;
    }
    listEl.innerHTML = filtered.map(function(k){
      var w = state.collection[k];
      return '<div class="word-row" data-row="'+k+'">' +
        '<div class="w">'+escapeHTML(w.word)+'<small>'+escapeHTML(w.category)+(w.isSlang?' \u00b7 Slang':'')+'</small></div>' +
        '<button class="fav" data-fav="'+k+'" style="opacity:'+(state.favorites[k]?'1':'0.28')+'">'+STAR_SVG+'</button>' +
        '</div>';
    }).join('');
  }
  function openDetail(key){
    var w = state.collection[key]; if(!w) return;
    document.getElementById('detailContent').innerHTML = specimenHTML(Object.assign({key:key}, w), {showSpeak:true, showFav:true});
    document.getElementById('detailOverlay').classList.remove('hidden');
  }
  function closeDetail(){ document.getElementById('detailOverlay').classList.add('hidden'); }

  // ---------- TABS ----------
  function switchView(name){
    document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
    document.getElementById('view-'+name).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-view')===name); });
    if(name==='home') renderHome();
    else if(name==='cards'){ if(!cardSession.queue) startCardSession(); else renderCards(); }
    else if(name==='quiz'){ if(!quizSession.questions) startQuiz(); else renderQuiz(); }
    else if(name==='mywords') renderMyWords();
  }

  // ---------- global click delegate ----------
  document.addEventListener('click', function(e){
    var el;
    if((el = e.target.closest('.tab-btn[data-view]'))){ switchView(el.getAttribute('data-view')); return; }
    if((el = e.target.closest('[data-say]'))){ speak(el.getAttribute('data-say')); return; }
    if((el = e.target.closest('[data-fav]'))){ toggleFavorite(el.getAttribute('data-fav')); return; }
    if((el = e.target.closest('[data-add]'))){ addToCollection(el.getAttribute('data-add')); return; }
    if((el = e.target.closest('#flashcardEl'))){ cardSession.flipped = !cardSession.flipped; renderCards(); return; }
    if((el = e.target.closest('[data-judge]'))){ judgeCard(el.getAttribute('data-judge')); return; }
    if((el = e.target.closest('#cardsAgainBtn'))){ startCardSession(); return; }
    if((el = e.target.closest('[data-quiz-opt]'))){ answerQuiz(parseInt(el.getAttribute('data-quiz-opt'),10)); return; }
    if((el = e.target.closest('#quizAgainBtn'))){ startQuiz(); return; }
    if((el = e.target.closest('[data-cat-chip]'))){ myWordsFilter.category = el.getAttribute('data-cat-chip'); renderMyWords(); return; }
    if((el = e.target.closest('[data-diff-chip]'))){ myWordsFilter.difficulty = el.getAttribute('data-diff-chip'); renderMyWords(); return; }
    if((el = e.target.closest('[data-fav-chip]'))){ myWordsFilter.favoritesOnly = !myWordsFilter.favoritesOnly; renderMyWords(); return; }
    if((el = e.target.closest('[data-row]'))){ openDetail(el.getAttribute('data-row')); return; }
    if((el = e.target.closest('#detailClose'))){ closeDetail(); return; }
    if(e.target.id === 'detailOverlay'){ closeDetail(); return; }
  });

  // ---------- init ----------
  loadState();
  ensureStarterWords();
  saveState();

  document.getElementById('dictSearchBtn').addEventListener('click', doSearch);
  document.getElementById('dictInput').addEventListener('keydown', function(e){ if(e.key==='Enter') doSearch(); });
  document.getElementById('myWordsSearch').addEventListener('input', renderMyWords);
  var accentBtn = document.getElementById('accentToggle');
  if(accentBtn){
    accentBtn.textContent = state.accent === 'us' ? 'US' : 'UK';
    accentBtn.addEventListener('click', function(){ setAccent(state.accent === 'us' ? 'uk' : 'us'); });
  }

  renderHome();

  // Keep the word-of-day and streak current if the app is left open
  // across midnight, without needing a manual reload.
  var currentDateKey = todayKey();
  setInterval(function(){
    var k = todayKey();
    if(k !== currentDateKey){
      currentDateKey = k;
      if(document.getElementById('view-home').classList.contains('active')) renderHome();
    }
  }, 30000);

  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').catch(function(){});
    });
  }
})();
