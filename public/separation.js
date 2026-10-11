// Palette inspection and colour-separated exports. Uses the current traced SVG.
let selectedInk=0;
const originalRenderPalette=renderPalette,originalStats=stats,originalSetButtons=setButtons;
function colourKey(value){
 const c=document.createElement('canvas').getContext('2d');
 c.fillStyle='#000000';c.fillStyle=value;c.fillRect(0,0,1,1);return Array.from(c.getImageData(0,0,1,1).data).join(',');
}
function inkSVG(fadeOthers=false){
 if(!svg||!palette[selectedInk])throw new Error('Pehle vectorize kijiye.');
 const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),root=doc.documentElement;
 const key=colourKey(hex(palette[selectedInk]));
 root.querySelectorAll('path,circle,ellipse,rect,polygon,polyline').forEach(p=>{
  if(colourKey(p.getAttribute('fill')||'#000000')!==key){
   if(fadeOthers)p.setAttribute('opacity','0.16');else p.remove();
  }
 });
 return new XMLSerializer().serializeToString(root);
}
async function renderInkCanvas(){
 const source=inkSVG(false),url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));
 try{
  const im=new Image();await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(new Error('Selected SVG render failed'));im.src=url});
  const c=document.createElement('canvas');c.width=cleanData.width;c.height=cleanData.height;
  const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0,c.width,c.height);
  if($('#hardInk').checked){
   const d=g.getImageData(0,0,c.width,c.height),p=palette[selectedInk];
   for(let i=0;i<d.data.length;i+=4){const on=d.data[i+3]>=128;d.data[i]=on?p.r:0;d.data[i+1]=on?p.g:0;d.data[i+2]=on?p.b:0;d.data[i+3]=on?255:0}
   g.putImageData(d,0,0);
  }return c;
 }finally{URL.revokeObjectURL(url)}
}
function updateInkPreview(){
 const valid=!!svg&&!!palette[selectedInk]&&!$('#svgBtn').disabled;
 $('#inkPanel').hidden=!valid;
 if(!valid)return;
 const p=palette[selectedInk];$('#inkName').textContent=hex(p).toUpperCase()+' · RGB '+p.r+', '+p.g+', '+p.b;
 $('#inkEdit').value=hex(p);
 $('#inkPreview').innerHTML=inkSVG(!$('#hideOtherInks').checked);
 const art=$('#inkPreview svg');art.style.width=$('#inkZoom').value+'%';art.style.maxWidth='none';art.style.height='auto';art.style.display='block';
 $('#inkZoomLabel').textContent=$('#inkZoom').value+'%';
}
renderPalette=function(){
 if(selectedInk>=palette.length)selectedInk=0;
 const box=$('#palette');box.innerHTML='';
 palette.forEach((c,i)=>{
  const b=document.createElement('button');b.type='button';b.className='inkSwatch'+(i===selectedInk?' selected':'');
  b.style.background=hex(c);b.setAttribute('aria-label','Select colour '+hex(c));b.setAttribute('aria-pressed',String(i===selectedInk));
  const label=document.createElement('span');label.textContent=hex(c).toUpperCase();b.appendChild(label);
  b.onclick=()=>{selectedInk=i;renderPalette();updateInkPreview();$('#inkPanel').scrollIntoView({behavior:'smooth',block:'nearest'})};box.appendChild(b);
 });
 updateInkPreview();
};
stats=function(ms){originalStats(ms);updateInkPreview()};
setButtons=function(on){originalSetButtons(on);if(!on){$('#inkPanel').hidden=true;$('#inkPreview').innerHTML='';}else updateInkPreview()};
$('#hideOtherInks').onchange=updateInkPreview;
$('#inkZoom').oninput=updateInkPreview;
$('#inkFit').onclick=()=>{$('#inkZoom').value=100;updateInkPreview()};
$('#inkEdit').onchange=e=>{if(!palette[selectedInk])return;palette[selectedInk]=parseHex(e.target.value);rebuild()};
$('#inkSvg').onclick=()=>{try{download('colour-'+hex(palette[selectedInk]).slice(1)+'.svg',new Blob([inkSVG()],{type:'image/svg+xml'}));status('Selected colour SVG download shuru.','good')}catch(e){status(e.message,'bad')}};
$('#inkPng').onclick=async()=>{
 const button=$('#inkPng');button.disabled=true;
 try{const c=await renderInkCanvas();const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNG export failed');
 download('colour-'+hex(palette[selectedInk]).slice(1)+($('#hardInk').checked?'-hard':'-smooth')+'.png',blob);status('Transparent colour PNG download shuru.','good');
 }catch(e){status(e.message,'bad')}finally{button.disabled=false}
};
