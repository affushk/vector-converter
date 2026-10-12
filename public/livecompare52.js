// v4.9 Live Compare Lens — mobile drag magnifier with split source/output preview.
let liveLensOn=false,liveLensX=.5,liveLensY=.5,liveSvgDataUrl='',liveCleanUrl='';

function svgDataUrl(){
  if(!svg)return '';
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function refreshLiveAssets(){
  if(!svg||!cleanCanvas||!srcUrl)return false;
  liveSvgDataUrl=svgDataUrl();
  try{liveCleanUrl=cleanCanvas.toDataURL('image/png')}catch{liveCleanUrl=''}
  const stage=$('#liveStage'),base=$('#liveBase');
  const w=cleanData?cleanData.width:cleanCanvas.width,h=cleanData?cleanData.height:cleanCanvas.height;
  stage.style.aspectRatio=w+' / '+h;
  base.innerHTML=svg;
  const art=base.querySelector('svg');
  if(art){art.setAttribute('width','100%');art.setAttribute('height','100%');art.setAttribute('preserveAspectRatio','none');art.style.display='block'}
  updateLiveLens();
  return true;
}
function lensSourceUrl(){
  const mode=$('#liveCompareMode').value;
  $('#lensTagLeft').textContent=mode==='clean-vector'?'CLEAN':'ORIGINAL';
  return mode==='clean-vector'?(liveCleanUrl||srcUrl):srcUrl;
}
function updateLiveLens(clientX=null,clientY=null){
  if(!liveLensOn||!svg)return;
  const stage=$('#liveStage'),lens=$('#compareLens'),rect=stage.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  if(clientX!==null&&clientY!==null){
    liveLensX=clamp((clientX-rect.left)/rect.width,0,1);
    liveLensY=clamp((clientY-rect.top)/rect.height,0,1);
  }
  const x=liveLensX*rect.width,y=liveLensY*rect.height;
  lens.style.left=x+'px';lens.style.top=y+'px';

  const zoom=(+$('#liveZoom').value||280)/100;
  $('#liveZoomV').textContent=zoom.toFixed(1)+'×';
  const d=lens.getBoundingClientRect().width||190;
  const bgW=rect.width*zoom,bgH=rect.height*zoom;
  const posX=d/2-x*zoom,posY=d/2-y*zoom;
  const commonSize=bgW+'px '+bgH+'px',commonPos=posX+'px '+posY+'px';
  const source=$('#lensSource'),output=$('#lensOutput');
  source.style.backgroundImage='url("'+lensSourceUrl().replace(/"/g,'%22')+'")';
  output.style.backgroundImage='url("'+liveSvgDataUrl.replace(/"/g,'%22')+'")';
  source.style.backgroundSize=commonSize;output.style.backgroundSize=commonSize;
  source.style.backgroundPosition=commonPos;output.style.backgroundPosition=commonPos;
}
function openLiveLens(){
  if(!refreshLiveAssets())return;
  liveLensOn=true;
  $('#liveStage').hidden=false;
  $('#liveLensBtn').classList.add('active');
  $('#liveLensBtn').textContent='✕ Close Live Lens';
  // Wait one frame so stage has real size.
  requestAnimationFrame(()=>updateLiveLens());
}
function closeLiveLens(){
  liveLensOn=false;
  $('#liveStage').hidden=true;
  $('#liveLensBtn').classList.remove('active');
  $('#liveLensBtn').textContent='🔍 Live Compare Lens';
}
$('#liveLensBtn').onclick=()=>liveLensOn?closeLiveLens():openLiveLens();
$('#liveCompareMode').onchange=()=>{if(liveLensOn){refreshLiveAssets();updateLiveLens()}};
$('#liveZoom').oninput=()=>{if(liveLensOn)updateLiveLens();else $('#liveZoomV').textContent=((+$('#liveZoom').value||280)/100).toFixed(1)+'×'};

const liveStage=$('#liveStage');
let dragging=false;
liveStage.addEventListener('pointerdown',e=>{
  if(!liveLensOn)return;
  dragging=true;
  try{liveStage.setPointerCapture(e.pointerId)}catch{}
  updateLiveLens(e.clientX,e.clientY);
  e.preventDefault();
});
liveStage.addEventListener('pointermove',e=>{
  if(!liveLensOn)return;
  if(e.pointerType==='mouse'||dragging)updateLiveLens(e.clientX,e.clientY);
});
liveStage.addEventListener('pointerup',e=>{
  dragging=false;
  try{liveStage.releasePointerCapture(e.pointerId)}catch{}
});
liveStage.addEventListener('pointercancel',()=>dragging=false);
window.addEventListener('resize',()=>{if(liveLensOn)requestAnimationFrame(()=>updateLiveLens())});

// Hook existing app state without changing the vector engine.
const previousLiveSetButtons=setButtons;
setButtons=function(on){
  previousLiveSetButtons(on);
  $('#liveLensBtn').disabled=!on;
  if(!on)closeLiveLens();
};
const previousLiveStats=stats;
stats=function(ms){
  previousLiveStats(ms);
  if(svg){
    $('#liveLensBtn').disabled=false;
    if(liveLensOn)refreshLiveAssets();
  }
};
