/* punevoice search. Runs in the reader's browser over a small index built with the site (assets/search/idx-N.js).
   No server, no third party, no cookies. The engine (top half) has no DOM in it and is also run by verify.py under node. */
(function(root){
'use strict';
var WEIGHT={h:10,g:6,s:5,b:2};                       // headline, kicker + tags + section + areas (every spelling, areas.json), standfirst, body
var STOP={the:1,a:1,an:1,of:1,'in':1,on:1,at:1,to:1,and:1,'for':1,by:1,is:1,was:1,'with':1,from:1,near:1};
var WORD=/[\p{L}\p{M}\p{N}]+/gu,WORD_O=/[\p{L}\p{M}\p{N}]+(?:['\u2019][\p{L}\p{M}]+)*/gu;

function norm(s){return String(s==null?'':s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/['\u2018\u2019`]/g,'');}
function words(s){return norm(s).match(WORD)||[];}
/* One key for a name written two ways in English (Hinjawadi / Hinjewadi / Hinjwadi, Yerawada / Yerwada, Wakad / Vakad). */
function key(w){
  if(w.length<5||/\d/.test(w))return '';
  var k=w.replace(/w/g,'v').replace(/ph/g,'f').replace(/z/g,'j').replace(/ee/g,'i').replace(/oo/g,'u').replace(/y/g,'i').replace(/([bdgkt])h/g,'$1');
  k=k.charAt(0)+k.slice(1,-1).replace(/[ae]/g,'')+k.slice(-1);
  return k.replace(/(.)\1+/g,'$1');
}
/* Edit distance (a swap of two neighbours counts once), given up as soon as it passes max. */
function dist(a,b,max){
  if(Math.abs(a.length-b.length)>max)return max+1;
  var p2=null,p=[],c,i,j,lo;
  for(j=0;j<=b.length;j++)p[j]=j;
  for(i=1;i<=a.length;i++){
    c=[i];lo=i;
    for(j=1;j<=b.length;j++){
      var v=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a.charCodeAt(i-1)===b.charCodeAt(j-1)?0:1));
      if(p2&&i>1&&j>1&&a.charCodeAt(i-1)===b.charCodeAt(j-2)&&a.charCodeAt(i-2)===b.charCodeAt(j-1))v=Math.min(v,p2[j-2]+1);
      c[j]=v;if(v<lo)lo=v;
    }
    if(lo>max)return max+1;
    p2=p;p=c;
  }
  return p[b.length];
}

function Engine(){this.docs=[];this.vocab=new Map();this.cache={};}
Engine.prototype.add=function(recs){
  var me=this;
  recs.forEach(function(r){
    var f={h:words(r.h),g:words([r.k,r.c].concat(r.g||[],r.a||[]).join(' ')),s:words(r.s),b:words(r.b)},d={r:r,t:r.t||'',set:{},str:{}};
    for(var k in f){d.set[k]=new Set(f[k]);d.str[k]=' '+f[k].join(' ')+' ';f[k].forEach(function(w){if(!me.vocab.has(w))me.vocab.set(w,key(w));});}
    d.sq=f.h.concat(f.g).join('');
    me.docs.push(d);
  });
  this.cache={};
};
/* Every word of the archive that a typed word stands for, with how close it is (1 the word itself \u2026 0.45 a likely typo). */
Engine.prototype.expand=function(t){
  if(this.cache[t])return this.cache[t];
  var m=new Map(),num=/^\d+$/.test(t),k=num?'':key(t);
  this.vocab.forEach(function(wk,w){
    var q=0;
    if(w===t)q=1;
    else if(!num&&t.length>1&&w.length>t.length&&w.lastIndexOf(t,0)===0)q=0.8;
    else if(!num&&t.length>3&&(t===w+'s'||t===w+'es'))q=0.8;
    else if(k&&wk===k&&Math.abs(w.length-t.length)<3)q=0.6;
    else if(!num&&t.length>4&&w.length>t.length+2&&w.indexOf(t)>0)q=0.5;      // "nagar" typed, "Shivajinagar" written
    if(q)m.set(w,q);
  });
  if(!m.size&&!num&&t.length>3){
    var lim=t.length>7?2:1;
    this.vocab.forEach(function(wk,w){if(w.charAt(0)===t.charAt(0)&&w.length>3&&!/\d/.test(w)&&dist(t,w,lim)<=lim)m.set(w,0.45);});
  }
  return (this.cache[t]=m);
};
Engine.prototype.search=function(query,sort){
  var all=words(query),ok=function(t){return t.length>1||/\d/.test(t);};
  var core=all.filter(function(t){return ok(t)&&!STOP[t];});
  if(!core.length)core=all.filter(ok);
  if(!core.length)core=all;
  core=core.filter(function(t,i){return core.indexOf(t)===i;}).slice(0,8);
  var out={items:[],partial:false,tokens:core,hl:new Set(),also:[]};
  if(!core.length)return out;
  var me=this,ex=core.map(function(t){return me.expand(t);}),phrase=' '+core.join(' '),full=[],some=[];
  this.docs.forEach(function(d){
    var n=0,score=0;
    core.forEach(function(t,i){
      var best=0;
      ex[i].forEach(function(q,w){for(var f in WEIGHT){if(WEIGHT[f]*q>best&&d.set[f].has(w))best=WEIGHT[f]*q;}});
      if(!best&&t.length>6&&d.sq.indexOf(t)>-1)best=WEIGHT.h*0.5;        // "shivajinagar" typed, "Shivaji Nagar" written
      if(best){n++;score+=best;}
    });
    if(!n)return;
    if(core.length>1){if(d.str.h.indexOf(phrase)>-1)score+=12;else if(d.str.s.indexOf(phrase)>-1)score+=4;else if(d.str.b.indexOf(phrase)>-1)score+=3;}
    (n===core.length?full:some).push({r:d.r,t:d.t,score:score+n*100});
  });
  out.partial=!full.length&&some.length>0;
  out.items=full.length?full:some;
  out.items.sort(function(a,b){return (sort==='new'?0:b.score-a.score)||(a.t<b.t?1:a.t>b.t?-1:0);});
  ex.forEach(function(m,i){
    var loose=[],exact=false;
    m.forEach(function(q,w){out.hl.add(w);if(q<0.8)loose.push(w);else if(q===1)exact=true;});
    if(loose.length)out.also.push({typed:core[i],words:loose.slice(0,4),exact:exact});
  });
  return out;
};
function has(text,hl){var m=String(text).match(WORD_O)||[],n=0,seen={};for(var i=0;i<m.length;i++){var w=norm(m[i]);if(hl.has(w)&&!seen[w]){seen[w]=1;n++;}}return n;}
/* The passage shown under a result: the standfirst if the words are in it, otherwise the part of the body that has most of them. */
function excerpt(r,hl){
  var best=r.s||'',top=has(best,hl),ps=String(r.b||'').split('\n'),i,n,body=false;
  for(i=0;i<ps.length;i++){n=has(ps[i],hl);if(n>top){top=n;best=ps[i];body=true;}}
  if(!body||best.length<=210)return best;
  var m,at=0;WORD_O.lastIndex=0;
  while((m=WORD_O.exec(best))){if(hl.has(norm(m[0]))){at=m.index;break;}}
  var a=Math.max(0,at-70),b;
  if(a>0){a=best.indexOf(' ',a)+1;}
  b=Math.min(best.length,a+200);
  if(b<best.length){b=best.lastIndexOf(' ',b);}
  return (a>0?'\u2026 ':'')+best.slice(a,b).replace(/[,;:\s]+$/,'')+(b<best.length?' \u2026':'');
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function mark(text,hl){
  var out='',last=0,m;text=String(text);WORD_O.lastIndex=0;
  while((m=WORD_O.exec(text))){out+=esc(text.slice(last,m.index))+(hl.has(norm(m[0]))?'<mark>'+esc(m[0])+'</mark>':esc(m[0]));last=m.index+m[0].length;}
  return out+esc(text.slice(last));
}
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function when(t){var m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(t||'');if(!m)return '';var h=+m[4];return (+m[3])+' '+MON[m[2]-1]+' '+m[1]+', '+(h%12||12)+':'+m[5]+' '+(h<12?'am':'pm');}

var api={Engine:Engine,norm:norm,words:words,key:key,dist:dist,excerpt:excerpt,mark:mark,when:when};
if(typeof module==='object'&&module.exports){module.exports=api;return;}

/* ------------------------------------------------------------------ the page */
var d=root.document,q=d.getElementById('q');if(!q)return;
var form=q.form,st=d.getElementById('qn'),res=d.getElementById('s-res'),idle=d.getElementById('s-idle'),clr=d.getElementById('qx'),sortEl=d.getElementById('qs');
var idleText=st.textContent,eng=new Engine(),meta={of:1,total:0},loaded=0,loading=false,failed=false,want=1,AUTO=3,STEP=20,shown=STEP,sort='rel',committed=false,timer=0;
var src=(d.currentScript&&d.currentScript.src)||'assets/search.js',dir=src.replace(/[^\/]*$/,'');

root.__pvQ=root.__pvQ||[];
root.__pvIdx=function(){
  while(root.__pvQ.length){var c=root.__pvQ.shift();meta=c;eng.add(c.d);loaded=Math.max(loaded,c.n+1);}
  loading=false;pump();render();
};
function pump(){
  if(loading||failed||!loaded||loaded>=meta.of||loaded>=want||!q.value.trim())return;
  loading=true;
  var s=d.createElement('script');s.src=dir+'search/idx-'+loaded+'.js';
  s.onerror=function(){loading=false;failed=true;render();};
  d.head.appendChild(s);
}
function plural(n){return n+(n===1?' story':' stories');}
function cap(w){return w.charAt(0).toUpperCase()+w.slice(1);}
function item(r,hl){
  var th=r.i?'<span class="thumb"><picture><source type="image/avif" srcset="'+dir+'img/'+esc(r.i)+'-sq.avif"><img src="'+dir+'img/'+esc(r.i)+'-sq.jpg" width="240" height="240" alt="" loading="lazy" decoding="async"></picture><span class="tag">Illustration</span></span>':'';
  return '<article class="sr-i"><div class="sr-c"><p class="kick">'+mark(r.k,hl)+'<span class="sep"> \u00b7 </span>'+mark(r.c,hl)+'</p>'
    +'<h2 class="wi-h hl"><a href="'+esc(r.u)+'">'+mark(r.h,hl)+'</a></h2><p class="sr-x">'+mark(excerpt(r,hl),hl)+'</p>'
    +'<p class="meta"><time datetime="'+esc(r.t)+'">'+esc(when(r.t))+'</time></p></div>'+th+'</article>';
}
function render(){
  var v=q.value.trim();
  clr.hidden=!q.value;
  if(!v){res.innerHTML='';idle.hidden=false;sortEl.hidden=true;st.textContent=idleText;return;}
  if(!loaded){st.textContent=failed?'Search could not be loaded. Please reload the page.':'Searching\u2026';return;}
  pump();
  var r=eng.search(v,sort),n=r.items.length,partIdx=loaded<meta.of,html='',say=v.length>28?v.slice(0,26)+'\u2026':v;
  st.textContent=n?(r.partial?'No story has all those words. '+n+(n===1?' has':' have')+' some.':plural(n)+' for \u201c'+say+'\u201d'):'No stories for \u201c'+say+'\u201d';
  if(partIdx)html+='<p class="s-also">Searched the newest '+eng.docs.length+' of '+meta.total+' stories.</p>';
  sortEl.hidden=n<2;
  r.also.forEach(function(a){
    var ws=a.words.filter(function(w){return w!==a.typed;});
    if(ws.length&&n)html+='<p class="s-also">'+(a.exact?'Also matching ':'Showing ')+ws.map(function(w){return '<b>'+esc(cap(w))+'</b>';}).join(', ')+(a.exact?'':' for \u201c'+esc(a.typed)+'\u201d')+'</p>';
  });
  if(n){
    html+='<div class="sr-list">'+r.items.slice(0,shown).map(function(x){return item(x.r,r.hl);}).join('')+'</div>';
    if(n>shown)html+='<p class="s-more"><button type="button" id="s-next">Show more results <span>('+(n-shown)+' left)</span></button></p>';
  }else{
    html+='<div class="s-none"><h2>Nothing found for \u201c'+esc(v)+'\u201d</h2><ul><li>Check the spelling, or try a shorter word.</li><li>Try a place, a name or a police station. One or two words work best.</li></ul></div>';
  }
  if(partIdx&&!loading&&loaded>=want)html+='<p class="s-more"><button type="button" id="s-older">Search older stories too</button></p>';
  else if(loading&&loaded)html+='<p class="s-more s-wait">Searching older stories\u2026</p>';
  if(failed&&loaded)html+='<p class="s-more s-wait">Older stories could not be loaded.</p>';
  res.innerHTML=html;idle.hidden=n>0;
}
function address(){
  var v=q.value.trim();
  return location.pathname+(v?'?q='+encodeURIComponent(v).replace(/%20/g,'+')+(sort==='new'?'&sort=new':''):'');
}
function write(push){
  clearTimeout(timer);timer=0;
  var u=address();
  try{if(u!==location.pathname+location.search)history[push?'pushState':'replaceState'](null,'',u);}catch(e){}
}
function read(){
  var p;try{p=new URLSearchParams(location.search);}catch(e){return '';}
  setSort(p.get('sort'));
  return p.get('q')||'';
}
function setSort(s){
  sort=s==='new'?'new':'rel';
  [].forEach.call(sortEl.querySelectorAll('button'),function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-sort')===sort));});
}
function go(v){q.value=v;shown=STEP;write(true);committed=true;render();root.scrollTo(0,0);}

q.addEventListener('input',function(){
  shown=STEP;render();
  if(committed){committed=false;write(true);return;}        // a new search after a finished one: Back returns to the finished one
  clearTimeout(timer);timer=setTimeout(function(){write(false);},300);
});
form.addEventListener('submit',function(e){
  e.preventDefault();write(false);committed=!!q.value.trim();render();
  try{if(root.matchMedia('(pointer:coarse)').matches)q.blur();}catch(x){}
});
clr.addEventListener('click',function(){q.value='';shown=STEP;committed=false;write(false);render();q.focus();});
q.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&q.value){e.preventDefault();clr.click();}
  if(e.key==='ArrowDown'){var a=res.querySelector('.sr-i a');if(a){e.preventDefault();a.focus();}}
});
res.addEventListener('keydown',function(e){
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
  var as=[].slice.call(res.querySelectorAll('.sr-i a')),i=as.indexOf(d.activeElement);if(i<0)return;
  e.preventDefault();
  if(e.key==='ArrowUp'&&i===0)q.focus();else if(as[i+(e.key==='ArrowDown'?1:-1)])as[i+(e.key==='ArrowDown'?1:-1)].focus();
});
res.addEventListener('click',function(e){
  var b=e.target.closest?e.target.closest('button'):null;if(!b)return;
  if(b.id==='s-next'){var k=res.querySelectorAll('.sr-i').length;shown+=STEP;render();var a=res.querySelectorAll('.sr-i a')[k];if(a)a.focus();}
  if(b.id==='s-older'){want=loaded+AUTO;pump();render();}
});
sortEl.addEventListener('click',function(e){
  var b=e.target.closest?e.target.closest('button'):null;if(!b)return;
  setSort(b.getAttribute('data-sort'));write(false);render();
});
d.addEventListener('click',function(e){
  var a=e.target.closest?e.target.closest('a[data-q]'):null;
  if(a&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey){e.preventDefault();go(a.getAttribute('data-q'));}
});
root.addEventListener('pagehide',function(){if(timer)write(false);});
root.addEventListener('popstate',function(){q.value=read();shown=STEP;committed=!!q.value;render();});

var first=read();
want=AUTO;
if(first){q.value=first;committed=true;}else{try{q.focus({preventScroll:true});}catch(e){q.focus();}}
root.__pvIdx();
})(typeof window!=='undefined'?window:this);
