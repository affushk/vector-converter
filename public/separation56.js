// Palette inspection, sharp-edge colour isolation and separation exports.
let selectedInk=0, inkViewMode='output';
const originalRenderPalette=renderPalette,originalStats=stats,originalSetButtons=setButtons;

function colourKey(value){
 const c=document.createElement('canvas').getContext('2d');
 c.fillStyle='#000000';c.fillStyle=value;c.fillRect(0,0,1,1);
 return Array.from(c.getImageData(0,0,1,1).data).join(',');
}
function inkSVG(fadeOthers=false){
 if(!svg||!palette[selectedInk])throw new Error('Pehle vectorize kijiye.');
 const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),root=doc.documentElement;
 const key=colourKey(hex(palette[selectedInk]));
 root.setAttribute('shape-rendering','geometricPrecision');
 root.querySelectorAll('path,circle,ellipse,rect,polygon,polyline').forEach(p=>{
  if(colourKey(p.getAttribute('fill')||'#000000')!==key){
   if(fadeOthers)p.setAttribute('opacity','0.10');else p.remove();
  }else{
   p.setAttribute('opacity','1');
  }
 });
 return new XMLSerializer().serializeToString(root);
}
function inkPixelCount(){
 if(!indexMap||!palette[selectedInk])return {n:0,total:0,pct:0};
 let n=0,total=0;
 for(let i=0;i<indexMap.length;i++){if(indexMap[i]!==65535)total++;if(indexMap[i]===selectedInk)n++}
 return {n,total,pct:total?100*n/total:0};
}
async function renderInkCanvas(){
 const source=inkSVG(false),url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));
 try{
  const im=new Image();await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(new Error('Selected SVG render failed'));im.src=url});
  const target=pngTargetLong(),sz=canvasSizeForLong(target),c=document.createElement('canvas');c.width=sz.w;c.height=sz.h;
  const g=c.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(im,0,0,c.width,c.height);
  if($('#hardInk').checked){
   const d=g.getImageData(0,0,c.width,c.height),p=palette[selectedInk];
   for(let i=0;i<d.data.length;i+=4){const on=d.data[i+3]>=128;d.data[i]=on?p.r:0;d.data[i+1]=on?p.g:0;d.data[i+2]=on?p.b:0;d.data[i+3]=on?255:0}
   g.putImageData(d,0,0);
  }
  return c;
 }finally{URL.revokeObjectURL(url)}
}
function setPalMode(mode){
 inkViewMode=mode;
 $('#palOriginal').classList.toggle('active',mode==='original');
 $('#palOutput').classList.toggle('active',mode==='output');
 updateInkPreview();
}
function updateInkPreview(){
 const valid=!!svg&&!!palette[selectedInk]&&!$('#svgBtn').disabled;
 $('#inkPanel').hidden=!valid;
 ['#palOriginal','#palOutput','#splitInk','#editInk'].forEach(s=>$(s).disabled=!valid);
 if(!valid)return;
 const p=palette[selectedInk],count=inkPixelCount();
 $('#inkName').textContent=hex(p).toUpperCase()+' · RGB '+p.r+', '+p.g+', '+p.b;
 $('#inkCoverage').textContent='Coverage '+count.pct.toFixed(1)+'% · '+count.n.toLocaleString()+' pixels';
 $('#inkEdit').value=hex(p);
 const box=$('#inkPreview');box.innerHTML='';
 if(inkViewMode==='original'){
   const im=document.createElement('img');im.src=srcUrl;im.alt='Original';im.style.width=$('#inkZoom').value+'%';box.appendChild(im);
   $('#paletteHint').textContent='Original reference view. Output dabao to selected colour ka sharp vector edge dekho.';
 }else{
   box.innerHTML=inkSVG(!$('#hideOtherInks').checked);
   const art=box.querySelector('svg');
   if(art){art.style.width=$('#inkZoom').value+'%';art.style.maxWidth='none';art.style.height='auto';art.style.display='block'}
   $('#paletteHint').textContent='OUTPUT: selected colour sharp vector me highlighted hai. Zoom karke edge check karo.';
 }
 $('#inkZoomLabel').textContent=$('#inkZoom').value+'%';
}
renderPalette=function(){
 if(selectedInk>=palette.length)selectedInk=0;
 const box=$('#palette');box.innerHTML='';
 palette.forEach((c,i)=>{
  const b=document.createElement('button');b.type='button';b.className='inkSwatch'+(i===selectedInk?' selected':'');
  b.style.background=hex(c);b.setAttribute('aria-label','Select colour '+hex(c));b.setAttribute('aria-pressed',String(i===selectedInk));
  const label=document.createElement('span');label.textContent=hex(c).toUpperCase();b.appendChild(label);
  b.onclick=()=>{selectedInk=i;inkViewMode='output';renderPalette();updateInkPreview();$('#inkPanel').scrollIntoView({behavior:'smooth',block:'nearest'})};
  box.appendChild(b);
 });
 updateInkPreview();
};
stats=function(ms){originalStats(ms);updateInkPreview()};
setButtons=function(on){
 originalSetButtons(on);
 ['#palOriginal','#palOutput','#splitInk','#editInk'].forEach(s=>$(s).disabled=!on);
 if(!on){$('#inkPanel').hidden=true;$('#inkPreview').innerHTML=''}else updateInkPreview();
};

$('#palOriginal').onclick=()=>setPalMode('original');
$('#palOutput').onclick=()=>setPalMode('output');
$('#hideOtherInks').onchange=()=>{if(inkViewMode==='output')updateInkPreview()};
$('#inkZoom').oninput=updateInkPreview;
$('#inkFit').onclick=()=>{$('#inkZoom').value=100;updateInkPreview()};
$('#editInk').onclick=()=>{
 if($('#inkPanel').hidden)return;
 $('#inkEdit').focus();$('#inkEdit').click();
 $('#inkPanel').scrollIntoView({behavior:'smooth',block:'center'});
};
$('#inkEdit').onchange=e=>{
 if(!palette[selectedInk])return;
 palette[selectedInk]={...parseHex(e.target.value),a:255};rebuild();inkViewMode='output';updateInkPreview();
};

function scaledOriginalData(){
 if(!srcImg||!cleanData)return null;
 const c=document.createElement('canvas');c.width=cleanData.width;c.height=cleanData.height;
 const g=c.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
 g.drawImage(srcImg,0,0,c.width,c.height);return g.getImageData(0,0,c.width,c.height);
}
function splitSelectedInk(){
 if(!indexMap||!palette[selectedInk])return;
 const source=scaledOriginalData();if(!source)return;
 const pts=[];const d=source.data;
 const step=Math.max(1,Math.floor(Math.sqrt(Math.max(1,indexMap.length/22000))));
 for(let p=0;p<indexMap.length;p+=step){
  if(indexMap[p]!==selectedInk)continue;
  const i=p*4;pts.push({r:d[i],g:d[i+1],b:d[i+2]});
 }
 if(pts.length<40){status('Split ke liye selected colour area bahut chhota hai.','bad');return}
 let min=pts[0],max=pts[0],minY=999,maxY=-1;
 for(const q of pts){const y=.2126*q.r+.7152*q.g+.0722*q.b;if(y<minY){minY=y;min=q}if(y>maxY){maxY=y;max=q}}
 let centers=[{...min},{...max}];
 const km=kmeans(pts,centers,9);centers=km.centers;
 if(d2(centers[0],centers[1])<260){status('Is colour me meaningful split detect nahi hua.','bad');return}
 const oldIndex=selectedInk,newIndex=palette.length;
 palette[oldIndex]={...centers[0],a:255};palette.push({...centers[1],a:255});
 let a=0,b=0;
 for(let p=0;p<indexMap.length;p++){
  if(indexMap[p]!==oldIndex)continue;
  const i=p*4,q={r:d[i],g:d[i+1],b:d[i+2]};
  const da=d2(q,centers[0]),db=d2(q,centers[1]);
  if(db<da){indexMap[p]=newIndex;b++}else a++;
 }
 if(!a||!b){palette.pop();for(let p=0;p<indexMap.length;p++)if(indexMap[p]===newIndex)indexMap[p]=oldIndex;status('Split stable nahi tha, change cancel kiya.','bad');return}
 rebuild();selectedInk=oldIndex;inkViewMode='output';renderPalette();status('Selected colour 2 inks me split ho gaya.','good');
}
$('#splitInk').onclick=splitSelectedInk;

$('#inkSvg').onclick=()=>{
 try{download('colour-'+hex(palette[selectedInk]).slice(1)+'-photoshop.svg',new Blob([makePhotoshopSvg(inkSVG())],{type:'image/svg+xml'}));status('Selected colour Photoshop SVG download shuru.','good')}
 catch(e){status(e.message,'bad')}
};
$('#inkPng').onclick=async()=>{
 const button=$('#inkPng');button.disabled=true;
 try{
  const c=await renderInkCanvas();const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNG export failed');
  download('colour-'+hex(palette[selectedInk]).slice(1)+'-'+Math.max(c.width,c.height)+'px'+($('#hardInk').checked?'-hard':'-smooth')+'.png',blob);
  status('Sharp colour PNG '+c.width+'×'+c.height+' download shuru.','good');
 }catch(e){status(e.message,'bad')}finally{button.disabled=false}
};
