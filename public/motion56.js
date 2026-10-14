// v5.6 — smooth premium motion, deliberately lightweight for mobile.
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
})();