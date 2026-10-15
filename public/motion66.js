// v6.6 — smooth premium motion, deliberately lightweight for mobile.
(()=>{
  const top=document.querySelector('.top');
  const onScroll=()=>top&&top.classList.toggle('scrolled',window.scrollY>12);
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();

  const cards=[...document.querySelectorAll('.card')];
  cards.forEach((el,i)=>{
    el.classList.add('atdReveal');
    el.style.transitionDelay=Math.min(i*35,180)+'ms';
  });
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver(entries=>{
      entries.forEach(e=>{
        if(e.isIntersecting){e.target.classList.add('atdVisible');io.unobserve(e.target)}
      });
    },{threshold:.08,rootMargin:'50px 0px -20px'});
    cards.forEach(el=>io.observe(el));
  }else cards.forEach(el=>el.classList.add('atdVisible'));

  document.querySelectorAll('.btn,.preset,.palTool').forEach(btn=>{
    btn.addEventListener('pointerdown',()=>btn.classList.add('atdPressed'),{passive:true});
    const off=()=>btn.classList.remove('atdPressed');
    btn.addEventListener('pointerup',off,{passive:true});
    btn.addEventListener('pointercancel',off,{passive:true});
  });


  const styleJump=document.getElementById('styleJump');
  const styleDock=document.getElementById('styleDock');
  styleJump?.addEventListener('click',()=>{
    styleDock?.scrollIntoView({behavior:'smooth',block:'start'});
    if(styleDock){
      styleDock.classList.remove('flashStyle');
      requestAnimationFrame(()=>styleDock.classList.add('flashStyle'));
      setTimeout(()=>styleDock.classList.remove('flashStyle'),950);
    }
  });

  const body=document.body;
  const themeSelect=document.getElementById('themeStyle');
  const fontSelect=document.getElementById('fontStyle');
  const styleReset=document.getElementById('styleReset');
  const keyTheme='atd_theme_v57',keyFont='atd_font_v57';

  function applyVisualStyle(theme,font,save=true){
    const safeTheme=['premium','minimal','light','amoled','soft'].includes(theme)?theme:'premium';
    const safeFont=['modern','elegant','rounded','compact'].includes(font)?font:'modern';
    body.dataset.theme=safeTheme;
    body.dataset.font=safeFont;
    if(themeSelect)themeSelect.value=safeTheme;
    if(fontSelect)fontSelect.value=safeFont;
    if(save){
      try{localStorage.setItem(keyTheme,safeTheme);localStorage.setItem(keyFont,safeFont)}catch{}
    }
  }
  let savedTheme='premium',savedFont='modern';
  try{
    savedTheme=localStorage.getItem(keyTheme)||'premium';
    savedFont=localStorage.getItem(keyFont)||'modern';
  }catch{}
  applyVisualStyle(savedTheme,savedFont,false);

  themeSelect?.addEventListener('change',()=>applyVisualStyle(themeSelect.value,fontSelect?.value||'modern'));
  fontSelect?.addEventListener('change',()=>applyVisualStyle(themeSelect?.value||'premium',fontSelect.value));
  styleReset?.addEventListener('click',()=>{
    applyVisualStyle('premium','modern');
    styleReset.animate([{transform:'scale(.96)'},{transform:'scale(1)'}],{duration:180,easing:'ease-out'});
  });

  const focusBtn=document.getElementById('focusVectorBtn');
  const focusOverlay=document.getElementById('focusOverlay');
  const focusCanvas=document.getElementById('focusCanvas');
  const closeFocusBtn=document.getElementById('closeFocusBtn');
  const closeFocus=()=>{if(focusOverlay)focusOverlay.hidden=true;if(focusCanvas)focusCanvas.innerHTML='';document.body.style.overflow=''};
  focusBtn?.addEventListener('click',()=>{
    const source=document.getElementById('vectorPreview');
    if(!source||!source.querySelector('svg'))return;
    focusCanvas.innerHTML=source.innerHTML;
    const art=focusCanvas.querySelector('svg');if(art){art.removeAttribute('width');art.removeAttribute('height');art.style.width='min(92vw,1200px)';art.style.height='auto'}
    focusOverlay.hidden=false;document.body.style.overflow='hidden';
  });
  closeFocusBtn?.addEventListener('click',closeFocus);
  focusOverlay?.addEventListener('click',e=>{if(e.target===focusOverlay)closeFocus()});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!focusOverlay?.hidden)closeFocus()});
})();