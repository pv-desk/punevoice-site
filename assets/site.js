/* punevoice site script: menu, About dropdown, hiding top bar, copy link, consent line, the "/" key. Under 3 KB. The page reads fully without it. */
(function(){
  var d=document,bar=d.querySelector('.bar'),panel=d.getElementById('menu'),btn=d.querySelector('.ib.menu');
  if(btn&&panel){btn.addEventListener('click',function(e){e.preventDefault();var open=panel.hidden;panel.hidden=!open;btn.setAttribute('aria-expanded',open);d.documentElement.style.overflow=open?'hidden':'';});}
  var last=0;addEventListener('scroll',function(){var y=scrollY;if(!bar||(panel&&!panel.hidden))return;if(y>last&&y>120)bar.classList.add('up');else if(y<last)bar.classList.remove('up');last=y;},{passive:true});
  d.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var u=b.getAttribute('data-copy'),done=function(){var t=b.textContent;b.textContent='Link copied';setTimeout(function(){b.textContent=t;},1600);};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(u).then(done,done);else done();});});
  var c=d.querySelector('.consent');if(c){try{if(localStorage.getItem('pv-consent-ok'))c.hidden=true;}catch(e){}
    var ok=c.querySelector('button');if(ok)ok.addEventListener('click',function(){c.hidden=true;try{localStorage.setItem('pv-consent-ok','1');}catch(e){}});}
  /* the About dropdown (a <details>: it opens and closes without this script too): aria-expanded, Escape, outside click, focus-out, arrows */
  var dd=d.querySelector('.about-dd');
  if(dd){var sm=dd.querySelector('summary'),ls=function(){return [].slice.call(dd.querySelectorAll('.about-list a'));},shut=function(f){dd.open=false;if(f)sm.focus();};
    dd.addEventListener('toggle',function(){sm.setAttribute('aria-expanded',String(dd.open));});
    d.addEventListener('click',function(e){if(dd.open&&!dd.contains(e.target))shut();});
    dd.addEventListener('focusout',function(e){if(dd.open&&e.relatedTarget&&!dd.contains(e.relatedTarget))shut();});
    dd.addEventListener('keydown',function(e){var l=ls(),i=l.indexOf(d.activeElement);
      if(e.key==='Escape'&&dd.open){e.preventDefault();shut(true);}
      else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();dd.open=true;var n=e.key==='ArrowDown'?(i<0?0:(i+1)%l.length):(i<=0?l.length-1:i-1);l[n].focus();}
      else if((e.key==='Home'||e.key==='End')&&i>-1){e.preventDefault();l[e.key==='Home'?0:l.length-1].focus();}});}
  /* "/" opens search (or puts the cursor in the field on the search page); search itself is assets/search.js */
  d.addEventListener('keydown',function(e){if(e.key!=='/'||e.metaKey||e.ctrlKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test((e.target||{}).tagName||''))return;
    var f=d.getElementById('q'),a=d.querySelector('.ib.search');if(f){e.preventDefault();f.focus();}else if(a){e.preventDefault();location.href=a.href;}});
})();
