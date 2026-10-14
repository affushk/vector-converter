const $=s=>document.querySelector(s);
let srcImg=null,srcUrl='',srcFile=null,cleanCanvas=null,cleanData=null,palette=[],indexMap=null,svg='',preset='printer',dotShapes=[],microProtectMask=null,lastAutoColourCount=0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function fmtBytes(n){if(n<1024)return n+' B';if(n<1048576)return(n/1024).toFixed(1)+' KB';return(n/1048576).toFixed(2)+' MB'}
function status(t,k=''){const e=$('#status');e.textContent=t;e.className='status'+(k?' '+k:'')}
function setButtons(on){['#svgBtn','#psSvgBtn','#epsBtn','#pngBtn','#copyBtn','#topSvg','#rebuild','#merge'].forEach(s=>$(s).disabled=!on)}
function hex(c){return '#'+[c.r,c.g,c.b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('')}
function parseHex(h){return{r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16),a:255}}
function d2(a,b){const dr=a.r-b.r,dg=a.g-b.g,db=a.b-b.b;return dr*dr*1.15+dg*dg*1.35+db*db*.9}
function rgb(c){return 'rgb('+c.r+','+c.g+','+c.b+')'}

const presetCfg={
 printer:{levels:0,noise:18,solid:18,curve:92,quality:'2400',colors:'auto'},
 textile:{levels:68,noise:44,solid:62,curve:86,quality:'2400',colors:'8'},
 sharp:{levels:50,noise:22,solid:38,curve:98,quality:'2400',colors:'6'},
 detail:{levels:36,noise:12,solid:22,curve:99,quality:'3200',colors:'16'},
 scan:{levels:84,noise:65,solid:70,curve:82,quality:'2400',colors:'auto'}
};
function applyPreset(name){preset=name;const c=presetCfg[name];$('#levels').value=c.levels;$('#noise').value=c.noise;$('#solid').value=c.solid;$('#curve').value=c.curve;$('#quality').value=c.quality;$('#colors').value=c.colors;$('#modeStat').textContent={printer:'Textile Pro Auto',textile:'Textile Solid',sharp:'Sharp Motif',detail:'Fine Detail',scan:'Scan Rescue'}[name];document.querySelectorAll('.preset').forEach(b=>b.classList.toggle('active',b.dataset.preset===name));sync()}
function sync(){[['levels','levelsV'],['noise','noiseV'],['solid','solidV'],['curve','curveV'],['bgTol','bgTolV'],['penStrength','penStrengthV']].forEach(([a,b])=>$('#'+b).textContent=$('#'+a).value);$('#colorStat').textContent=$('#colors').value==='auto'?'Auto':$('#colors').value}
['levels','noise','solid','curve','bgTol','penStrength'].forEach(id=>$('#'+id).addEventListener('input',sync));
$('#colors').onchange=sync;
document.querySelectorAll('.preset').forEach(b=>b.onclick=()=>applyPreset(b.dataset.preset));
$('#transparent').onchange=()=>$('#bgFields').style.display=$('#transparent').checked?'grid':'none';

$('#file').addEventListener('change',e=>{
 const f=e.target.files&&e.target.files[0];if(!f)return;srcFile=f;
 const r=new FileReader();r.onload=()=>{srcUrl=r.result;const im=new Image();im.onload=()=>{
   srcImg=im;$('#original').innerHTML='<img src="'+srcUrl+'" alt="original">';$('#cmpOriginal').innerHTML='<img src="'+srcUrl+'" alt="original">';
   $('#dim').textContent=im.naturalWidth+'×'+im.naturalHeight;$('#size').textContent=fmtBytes(f.size);$('#convertBtn').disabled=false;
   cleanCanvas=null;cleanData=null;palette=[];indexMap=null;svg='';dotShapes=[];microProtectMask=null;lastAutoColourCount=0;setButtons(false);
   $('#cleanPreview').innerHTML='<div class="empty">Vectorize dabao</div>';$('#vectorPreview').innerHTML='<div class="empty">Vector result</div>';$('#palette').innerHTML='<span class="sub">Result ke baad palette aayegi.</span>';
   status('Image loaded. Printer Match Vectorize dabaiye.','good')
 };im.src=srcUrl};r.readAsDataURL(f)
});

function sourceCanvas(){
 const max=+$('#quality').value||2400,w=srcImg.naturalWidth,h=srcImg.naturalHeight,long=Math.max(w,h);
 let target=$('#supersample').checked?Math.min(max,long*2):Math.min(max,long);
 if(preset==='detail'&&$('#supersample').checked)target=Math.min(4000,max);
 const sc=target/long,c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*sc));c.height=Math.max(1,Math.round(h*sc));
 const g=c.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(srcImg,0,0,c.width,c.height);return c
}

function autoLevels(imgd,strength){
 if(strength<=0)return;const d=imgd.data,h=new Uint32Array(256);for(let i=0;i<d.length;i+=16){const y=Math.round(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2]);h[y]++}
 let total=0;for(const v of h)total+=v;const cut=Math.max(1,Math.round(total*.012)),find=(rev=false)=>{let a=0;if(!rev){for(let i=0;i<256;i++){a+=h[i];if(a>=cut)return i}}else{for(let i=255;i>=0;i--){a+=h[i];if(a>=cut)return i}}return rev?255:0};
 const lo=find(false),hi=find(true);if(hi<=lo+10)return;const amt=strength/100;
 for(let i=0;i<d.length;i+=4){const y=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2],ty=clamp((y-lo)*255/(hi-lo),0,255),scale=y>1?((y*(1-amt)+ty*amt)/y):1;d[i]=clamp(Math.round(d[i]*scale),0,255);d[i+1]=clamp(Math.round(d[i+1]*scale),0,255);d[i+2]=clamp(Math.round(d[i+2]*scale),0,255)}
}

function edgeAwareSmooth(imgd,strength){
 if(strength<3)return;const d=imgd.data,w=imgd.width,h=imgd.height,out=new Uint8ClampedArray(d),th=16+strength*1.45,a=Math.min(.64,strength/125);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=(y*w+x)*4,cr=d[i],cg=d[i+1],cb=d[i+2];let sr=0,sg=0,sb=0,n=0;
   for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){const j=((y+yy)*w+x+xx)*4,dd=Math.abs(d[j]-cr)+Math.abs(d[j+1]-cg)+Math.abs(d[j+2]-cb);if(dd<th*3){sr+=d[j];sg+=d[j+1];sb+=d[j+2];n++}}
   if(n>1){out[i]=Math.round(cr*(1-a)+(sr/n)*a);out[i+1]=Math.round(cg*(1-a)+(sg/n)*a);out[i+2]=Math.round(cb*(1-a)+(sb/n)*a)}
 }imgd.data.set(out)
}

function flatSamplePoints(imgd,max=18000){
 const d=imgd.data,w=imgd.width,h=imgd.height;
 const step=Math.max(1,Math.floor(Math.sqrt((w*h)/max))),pts=[];
 const reject=$('#antiAliasReject')&&$('#antiAliasReject').checked;
 for(let y=1;y<h-1;y+=step)for(let x=1;x<w-1;x+=step){
   const i=(y*w+x)*4;if(d[i+3]<32)continue;
   const p={r:d[i],g:d[i+1],b:d[i+2]};
   if(reject){
     const ns=[i-4,i+4,i-w*4,i+w*4];
     let worst=0,avg=0;
     for(const q of ns){
       const c={r:d[q],g:d[q+1],b:d[q+2]},dd=d2(p,c);
       if(dd>worst)worst=dd;avg+=dd;
     }
     avg/=4;
     // Reject boundary blends and JPEG halo pixels; keep mildly noisy flat interiors.
     if(worst>1050||avg>360)continue;
   }
   pts.push(p);
 }
 if(pts.length<Math.min(500,max*.08))return samplePoints(imgd,max);
 return pts;
}
function snapCentersToSource(pts,centers){
 return centers.map(c=>{
   let best=null,bd=Infinity;
   const stride=Math.max(1,Math.floor(pts.length/7000));
   for(let i=0;i<pts.length;i+=stride){const p=pts[i],dd=d2(p,c);if(dd<bd){bd=dd;best=p}}
   return best?{r:best.r,g:best.g,b:best.b,a:255}:{r:Math.round(c.r),g:Math.round(c.g),b:Math.round(c.b),a:255};
 });
}
function collapseNearPalette(pal,threshold=520){
 const out=[];
 for(const c of pal){
   let bi=-1,bd=Infinity;
   for(let i=0;i<out.length;i++){const dd=d2(c,out[i]);if(dd<bd){bd=dd;bi=i}}
   if(bi>=0&&bd<threshold){
     // Keep the more source-like peak rather than averaging to a new fake colour.
     continue;
   }
   out.push({...c,a:255});
 }
 return out;
}

function samplePoints(imgd,max=18000){
 const d=imgd.data,step=Math.max(1,Math.floor(Math.sqrt((imgd.width*imgd.height)/max))),pts=[];
 for(let y=0;y<imgd.height;y+=step)for(let x=0;x<imgd.width;x+=step){const i=(y*imgd.width+x)*4;if(d[i+3]>20)pts.push({r:d[i],g:d[i+1],b:d[i+2]})}return pts
}
function seedPalette(pts,k){
 const bins=new Map();for(const p of pts){const key=((p.r>>4)<<8)|((p.g>>4)<<4)|(p.b>>4),v=bins.get(key)||{n:0,r:0,g:0,b:0};v.n++;v.r+=p.r;v.g+=p.g;v.b+=p.b;bins.set(key,v)}
 const cand=[...bins.values()].sort((a,b)=>b.n-a.n).map(v=>({r:v.r/v.n,g:v.g/v.n,b:v.b/v.n,n:v.n})),out=[];
 for(const p of cand){if(out.length>=k)break;if(!out.length||out.every(q=>d2(p,q)>700))out.push(p)}
 for(const p of cand){if(out.length>=k)break;if(!out.includes(p))out.push(p)}while(out.length<k)out.push({r:255*out.length/Math.max(1,k-1),g:255*out.length/Math.max(1,k-1),b:255*out.length/Math.max(1,k-1),n:1});return out.slice(0,k)
}
function kmeans(pts,centers,iters=7){
 centers=centers.map(c=>({...c}));let counts=[];
 for(let it=0;it<iters;it++){const sums=centers.map(()=>({r:0,g:0,b:0,n:0}));
   for(const p of pts){let bi=0,bd=Infinity;for(let j=0;j<centers.length;j++){const dd=d2(p,centers[j]);if(dd<bd){bd=dd;bi=j}}const s=sums[bi];s.r+=p.r;s.g+=p.g;s.b+=p.b;s.n++}
   counts=sums.map(s=>s.n);for(let j=0;j<centers.length;j++){const s=sums[j];if(s.n)centers[j]={r:s.r/s.n,g:s.g/s.n,b:s.b/s.n,a:255}}
 }return{centers:centers.map(c=>({r:Math.round(c.r),g:Math.round(c.g),b:Math.round(c.b),a:255})),counts}
}
function paletteError(pts,centers){
 let e=0;for(const p of pts){let bd=Infinity;for(const c of centers){const dd=d2(p,c);if(dd<bd)bd=dd}e+=bd}
 return e/Math.max(1,pts.length);
}
function smartAutoPalette(imgd){
 const useFlat=$('#flatColorLock')&&$('#flatColorLock').checked;
 const pts=useFlat?flatSamplePoints(imgd,16000):samplePoints(imgd,16000),models=[];
 for(let k=2;k<=10;k++){
   const km=kmeans(pts,seedPalette(pts,k),8),centers=snapCentersToSource(pts,km.centers),err=paletteError(pts,centers);
   models.push({k,centers,err});
 }
 let pick=models[models.length-1];
 // Prefer the first strong elbow: flat textile artwork should stay at its true small palette.
 for(let i=1;i<models.length-1;i++){
   const prev=models[i-1],cur=models[i],next=models[i+1];
   const gainPrev=(prev.err-cur.err)/Math.max(1,prev.err);
   const gainNext=(cur.err-next.err)/Math.max(1,cur.err);
   if(gainPrev>.115 && gainNext<.060){pick=cur;break}
 }
 if(pick===models[models.length-1]){
   let best=models[0],bestScore=Infinity;
   for(const m of models){
     const complexity=1+(m.k-2)*.085,score=m.err*complexity;
     if(score<bestScore){bestScore=score;best=m}
   }
   pick=best;
 }
 let result=collapseNearPalette(pick.centers,520);
 if(result.length<2)result=pick.centers;
 lastAutoColourCount=result.length;
 return result;
}
function autoPalette(imgd){
 if($('#smartAutoColors')&&$('#smartAutoColors').checked)return smartAutoPalette(imgd);
 const pts=($('#flatColorLock')&&$('#flatColorLock').checked)?flatSamplePoints(imgd):samplePoints(imgd),km=kmeans(pts,seedPalette(pts,12),8),total=pts.length;let arr=km.centers.map((c,i)=>({...c,n:km.counts[i]||0})).filter(c=>c.n/Math.max(1,total)>.0025).sort((a,b)=>b.n-a.n);
 let changed=true;while(changed){changed=false;outer:for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){if(d2(arr[i],arr[j])<1250){const n=arr[i].n+arr[j].n;arr[i]={r:Math.round((arr[i].r*arr[i].n+arr[j].r*arr[j].n)/n),g:Math.round((arr[i].g*arr[i].n+arr[j].g*arr[j].n)/n),b:Math.round((arr[i].b*arr[i].n+arr[j].b*arr[j].n)/n),a:255,n};arr.splice(j,1);changed=true;break outer}}}
 if(arr.length<2)return kmeans(pts,seedPalette(pts,4),7).centers;
 let result=arr.slice(0,12).map(({r,g,b,a})=>({r,g,b,a}));
 if($('#exactPalette')&&$('#exactPalette').checked)result=snapCentersToSource(pts,result);
 result=collapseNearPalette(result,520);
 lastAutoColourCount=result.length;
 return result
}
function fixedPalette(imgd,k){
 const pts=($('#flatColorLock')&&$('#flatColorLock').checked)?flatSamplePoints(imgd):samplePoints(imgd);
 const km=kmeans(pts,seedPalette(pts,k),8);
 return ($('#exactPalette')&&$('#exactPalette').checked)?snapCentersToSource(pts,km.centers):km.centers;
}

function buildMicroProtectMask(map,w,h,k){
 if(!$('#microProtect')||!$('#microProtect').checked)return null;
 const bg=dominantIndex(map,k),seen=new Uint8Array(map.length),protect=new Uint8Array(map.length);
 const maxArea=Math.max(18,Math.floor(map.length*.0018));
 for(let start=0;start<map.length;start++){
  const col=map[start];if(seen[start]||col===65535||col===bg||col>=k)continue;
  const stack=[start],pix=[];seen[start]=1;
  while(stack.length&&pix.length<=maxArea+1){
   const p=stack.pop(),x=p%w,y=(p/w)|0;pix.push(p);
   const ns=[p-1,p+1,p-w,p+w];
   for(let d=0;d<4;d++){
    const q=ns[d],nx=d===0?x-1:d===1?x+1:x,ny=d===2?y-1:d===3?y+1:y;
    if(nx<0||nx>=w||ny<0||ny>=h||q<0||q>=map.length||seen[q]||map[q]!==col)continue;
    seen[q]=1;stack.push(q);
   }
  }
  if(pix.length<=maxArea)for(const p of pix)protect[p]=1;
 }
 return protect;
}

function nearest(p,pal){let b=0,bd=Infinity,second=Infinity;for(let j=0;j<pal.length;j++){const dd=d2(p,pal[j]);if(dd<bd){second=bd;bd=dd;b=j}else if(dd<second)second=dd}return[b,bd,second]}
function quantize(imgd,pal){
 const d=imgd.data,map=new Uint16Array(imgd.width*imgd.height),confidence=new Uint16Array(map.length);
 for(let p=0,i=0;i<d.length;i+=4,p++){if(d[i+3]<16){map[p]=65535;continue}const n=nearest({r:d[i],g:d[i+1],b:d[i+2]},pal),c=pal[n[0]];map[p]=n[0];confidence[p]=clamp(Math.round((n[2]-n[1])/8),0,65534);d[i]=c.r;d[i+1]=c.g;d[i+2]=c.b;d[i+3]=255}
 return{map,confidence}
}
function smoothClassMap(imgd,map,confidence,strength){
 if(strength<5)return;const w=imgd.width,h=imgd.height,k=palette.length,passes=strength>70?2:1,need=strength>58?5:6;
 for(let pass=0;pass<passes;pass++){const next=new Uint16Array(map),counts=new Uint8Array(k);
   for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=y*w+x,cur=map[p];if(cur===65535)continue;if(microProtectMask&&microProtectMask[p])continue;counts.fill(0);
     for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){const q=map[(y+yy)*w+x+xx];if(q!==65535&&q<k)counts[q]++}
     let best=cur,bn=counts[cur];for(let j=0;j<k;j++)if(counts[j]>bn){bn=counts[j];best=j}
     const edgeAmbiguous=confidence[p]<Math.max(35,180-strength);if(best!==cur&&bn>=need&&edgeAmbiguous)next[p]=best
   }map.set(next)
 }
 const d=imgd.data;for(let p=0,i=0;p<map.length;p++,i+=4){const q=map[p];if(q===65535){d[i+3]=0;continue}const c=palette[q];d[i]=c.r;d[i+1]=c.g;d[i+2]=c.b;d[i+3]=255}
}
function polishLabels(imgd,map,strength){
 if(strength<1)return;
 const w=imgd.width,h=imgd.height,k=palette.length,d=imgd.data;
 // Printer Match intentionally smooths only boundaries, not large interiors.
 const passes=strength>=60?3:2;
 for(let pass=0;pass<passes;pass++){
   const next=new Uint16Array(map);
   for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
     const p=y*w+x,cur=map[p];if(cur===65535)continue;
     // Skip stable interior pixels.
     if(map[p-1]===cur&&map[p+1]===cur&&map[p-w]===cur&&map[p+w]===cur)continue;
     const counts=new Uint8Array(k);
     for(let yy=-2;yy<=2;yy++)for(let xx=-2;xx<=2;xx++){
       const q=map[(y+yy)*w+x+xx];if(q!==65535&&q<k){
         const wt=(xx===0&&yy===0)?4:(Math.abs(xx)<=1&&Math.abs(yy)<=1?2:1);
         counts[q]+=wt;
       }
     }
     let best=cur,bn=counts[cur];for(let j=0;j<k;j++)if(counts[j]>bn){bn=counts[j];best=j}
     if(best!==cur&&bn>=12)next[p]=best;
   }
   map.set(next);
 }
 for(let p=0,i=0;p<map.length;p++,i+=4){
   const q=map[p];if(q===65535){d[i+3]=0;continue}
   const cc=palette[q];d[i]=cc.r;d[i+1]=cc.g;d[i+2]=cc.b;d[i+3]=255;
 }
}

function paintFromMap(imgd,map){
 const d=imgd.data;
 for(let p=0,i=0;p<map.length;p++,i+=4){
  const q=map[p];
  if(q===65535){d[i+3]=0;continue}
  const c=palette[q]||palette[0];
  d[i]=c.r;d[i+1]=c.g;d[i+2]=c.b;d[i+3]=255;
 }
}
function penToolShapeFix(imgd,map,strength){
 if(!$('#penFix')||!$('#penFix').checked||strength<4)return;
 const w=imgd.width,h=imgd.height,k=palette.length,protect=$('#protectDetails')&&$('#protectDetails').checked;
 const radius=strength>=88?3:2,passes=strength>=86?2:1;
 const minGain=radius===3?4.6:3.2;
 for(let pass=0;pass<passes;pass++){
  const src=new Uint16Array(map),next=new Uint16Array(src);
  for(let y=radius;y<h-radius;y++)for(let x=radius;x<w-radius;x++){
   const p=y*w+x,cur=src[p]; if(cur===65535)continue;
   if(microProtectMask&&microProtectMask[p])continue;
   // Stable interior stays untouched.
   if(src[p-1]===cur&&src[p+1]===cur&&src[p-w]===cur&&src[p+w]===cur)continue;

   const score=new Float32Array(k); let curNear=0,foreignNear=0;
   for(let yy=-radius;yy<=radius;yy++)for(let xx=-radius;xx<=radius;xx++){
    const ds=xx*xx+yy*yy;if(ds>radius*radius+1)continue;
    const q=src[(y+yy)*w+x+xx]; if(q===65535||q>=k)continue;
    const wt=(xx===0&&yy===0)?3.2:(ds<=1?2.2:(ds<=4?1.35:.75));
    score[q]+=wt;
    if(Math.abs(xx)<=1&&Math.abs(yy)<=1){if(q===cur)curNear++;else foreignNear++}
   }
   let best=cur,bestScore=score[cur];
   for(let q=0;q<k;q++)if(score[q]>bestScore){best=q;bestScore=score[q]}
   if(best===cur)continue;

   // Protect intentional tiny dots / narrow strokes from collapsing.
   if(protect){
    let sameLine=0;
    for(let t=-2;t<=2;t++){
     if(src[y*w+clamp(x+t,0,w-1)]===cur)sameLine++;
     if(src[clamp(y+t,0,h-1)*w+x]===cur)sameLine++;
    }
    if(curNear<=3 && sameLine<=4)continue;
   }
   const gain=bestScore-score[cur];
   const dominance=bestScore/Math.max(0.001,score[cur]);
   if(gain>=minGain && dominance>(1.16+(100-strength)*0.0022) && foreignNear>=4)next[p]=best;
  }
  map.set(next);
 }
 paintFromMap(imgd,map);
}


function refineBoundaryLines(imgd,map,strength){
 if(strength<5)return;
 const w=imgd.width,h=imgd.height,k=palette.length,src=new Uint16Array(map),next=new Uint16Array(src);
 // Only remove obvious one-pixel stair-step spikes/notches. This is intentionally one conservative pass.
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const p=y*w+x,cur=src[p];if(cur===65535||cur>=k)continue;
  if(microProtectMask&&microProtectMask[p])continue;
  const counts=new Uint8Array(k);let same8=0;
  for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){
   if(xx===0&&yy===0)continue;
   const q=src[(y+yy)*w+x+xx];
   if(q===65535||q>=k)continue;
   counts[q]++;if(q===cur)same8++;
  }
  let best=cur,bn=counts[cur];
  for(let q=0;q<k;q++)if(counts[q]>bn){bn=counts[q];best=q}
  // A pixel must be a clear isolated spike before changing. Corners and thin real details stay intact.
  if(best!==cur && same8<=2 && bn>=5)next[p]=best;
 }
 map.set(next);paintFromMap(imgd,map);
}


function dominantIndex(map,k){
 const counts=new Uint32Array(k);
 for(let i=0;i<map.length;i++){const q=map[i];if(q!==65535&&q<k)counts[q]++}
 let bi=0;for(let i=1;i<k;i++)if(counts[i]>counts[bi])bi=i;
 return bi;
}
function adaptiveCurveFair(imgd,map,confidence,strength){
 if(!$('#adaptiveFair')||!$('#adaptiveFair').checked||strength<4)return;
 const w=imgd.width,h=imgd.height,k=palette.length,src=new Uint16Array(map),next=new Uint16Array(src);
 const confCut=Math.max(14,42-Math.round(strength*.22));
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const p=y*w+x,cur=src[p];if(cur===65535||cur>=k)continue;
  if(microProtectMask&&microProtectMask[p])continue;
  if(confidence&&confidence[p]>confCut)continue;
  if(src[p-1]===cur&&src[p+1]===cur&&src[p-w]===cur&&src[p+w]===cur)continue;
  const counts=new Uint8Array(k);
  for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){
    const q=src[(y+yy)*w+x+xx];if(q!==65535&&q<k)counts[q]++;
  }
  let best=cur,bn=counts[cur];
  for(let q=0;q<k;q++)if(counts[q]>bn){best=q;bn=counts[q]}
  if(best!==cur&&bn>=6)next[p]=best;
 }
 map.set(next);paintFromMap(imgd,map);
}
function autoSymmetryAssist(imgd,map,confidence){
 if(!$('#autoSymmetry')||!$('#autoSymmetry').checked||!confidence)return {applied:false,score:0};
 const w=imgd.width,h=imgd.height,k=palette.length,bg=dominantIndex(map,k);
 let minX=w,minY=h,maxX=-1,maxY=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const q=map[y*w+x];if(q!==65535&&q!==bg){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}
 }
 if(maxX<=minX+20||maxY<=minY+20)return {applied:false,score:0};
 let same=0,total=0;
 const cx=(minX+maxX)/2;
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=Math.floor(cx);x++){
   const mx=Math.round(2*cx-x);if(mx<0||mx>=w)continue;
   const a=map[y*w+x],b=map[y*w+mx];
   if(a===bg&&b===bg)continue;
   total++;if(a===b)same++;
 }
 const score=total?same/total:0;
 if(score<.965)return {applied:false,score};
 const next=new Uint16Array(map);let edits=0;
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=Math.floor(cx);x++){
   const mx=Math.round(2*cx-x);if(mx<0||mx>=w)continue;
   const p=y*w+x,m=y*w+mx,a=map[p],b=map[m];if(a===b)continue;
   const ca=confidence[p]||0,cb=confidence[m]||0;
   if(ca>cb+18){next[m]=a;edits++}else if(cb>ca+18){next[p]=b;edits++}
 }
 if(edits){map.set(next);paintFromMap(imgd,map)}
 return {applied:edits>0,score,edits};
}
function componentCircles(map,w,h,k){
 if(!$('#perfectCircles')||!$('#perfectCircles').checked)return [];
 const bg=dominantIndex(map,k),seen=new Uint8Array(map.length),out=[];
 const maxArea=map.length*.012,minArea=Math.max(10,map.length*.00001);
 for(let start=0;start<map.length;start++){
  const col=map[start];if(seen[start]||col===65535||col===bg||col>=k)continue;
  let stack=[start],area=0,sx=0,sy=0,minX=w,minY=h,maxX=0,maxY=0,perim=0,pixels=[];
  seen[start]=1;
  while(stack.length){
   const p=stack.pop(),x=p%w,y=(p/w)|0;area++;sx+=x+.5;sy+=y+.5;pixels.push(p);
   if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
   const ns=[p-1,p+1,p-w,p+w];
   for(let d=0;d<4;d++){
    const q=ns[d],nx=d===0?x-1:d===1?x+1:x,ny=d===2?y-1:d===3?y+1:y;
    if(nx<0||nx>=w||ny<0||ny>=h||map[q]!==col){perim++;continue}
    if(!seen[q]){seen[q]=1;stack.push(q)}
   }
  }
  if(area<minArea||area>maxArea)continue;
  const bw=maxX-minX+1,bh=maxY-minY+1,aspect=bw/bh,fill=area/(bw*bh),circ=4*Math.PI*area/Math.max(1,perim*perim);
  if(aspect<.86||aspect>1.16||fill<.66||circ<.66)continue;
  const cx=sx/area,cy=sy/area;
  let r2=0;for(const p of pixels){const x=p%w+.5,y=((p/w)|0)+.5,dd=(x-cx)*(x-cx)+(y-cy)*(y-cy);if(dd>r2)r2=dd}
  out.push({color:col,cx,cy,r:Math.sqrt(r2)+.15});
 }
 return out;
}
function enhanceVectorGraphSvg(s,imgd){
 const doc=new DOMParser().parseFromString(s,'image/svg+xml'),root=doc.documentElement;
 const vb=(root.getAttribute('viewBox')||'').trim().split(/\s+/).map(Number);
 const vw=vb.length===4?vb[2]:imgd.width,vh=vb.length===4?vb[3]:imgd.height;
 const sx=vw/imgd.width,sy=vh/imgd.height;
 if($('#gapFiller')&&$('#gapFiller').checked){
   root.querySelectorAll('path,polygon,rect,circle,ellipse').forEach(el=>{
     const fill=el.getAttribute('fill');if(!fill||fill==='none')return;
     el.setAttribute('stroke',fill);
     el.setAttribute('stroke-width',String(Math.max(.18,.22*Math.max(sx,sy))));
     el.setAttribute('stroke-linejoin','round');
     el.setAttribute('stroke-linecap','round');
     el.setAttribute('paint-order','stroke fill');
   });
 }
 const circles=componentCircles(indexMap,cleanData.width,cleanData.height,palette.length);
 if(circles.length){
   const ns='http://www.w3.org/2000/svg',g=doc.createElementNS(ns,'g');g.setAttribute('data-geometry-fit','circles');
   circles.forEach(q=>{
     const el=doc.createElementNS(ns,'circle');
     el.setAttribute('cx',(q.cx*sx).toFixed(3));el.setAttribute('cy',(q.cy*sy).toFixed(3));
     el.setAttribute('r',(q.r*(sx+sy)/2).toFixed(3));el.setAttribute('fill',hex(palette[q.color]));
     if($('#gapFiller')&&$('#gapFiller').checked){el.setAttribute('stroke',hex(palette[q.color]));el.setAttribute('stroke-width',String(Math.max(.18,.22*Math.max(sx,sy))))}
     g.appendChild(el);
   });
   root.appendChild(g);
 }
 root.setAttribute('data-vector-graph-lite','1');
 return new XMLSerializer().serializeToString(root);
}

function transparentBg(imgd){
 if(!$('#transparent').checked)return;const bg=parseHex($('#bgColor').value),tol=+$('#bgTol').value,t=(8+tol*2.15)**2,d=imgd.data;
 for(let i=0;i<d.length;i+=4){const dr=d[i]-bg.r,dg=d[i+1]-bg.g,db=d[i+2]-bg.b;if(dr*dr+dg*dg+db*db<t)d[i+3]=0}
}

function canvasFrom(imgd){const c=document.createElement('canvas');c.width=imgd.width;c.height=imgd.height;c.getContext('2d').putImageData(imgd,0,0);return c}
function makeSharpPreviewCanvas(srcCanvas){
 const boxW=Math.min(620,Math.max(280,window.innerWidth-70));
 const sc=Math.min(1,boxW/srcCanvas.width),cssW=Math.max(1,Math.round(srcCanvas.width*sc)),cssH=Math.max(1,Math.round(srcCanvas.height*sc));
 const dpr=Math.min(2,window.devicePixelRatio||1),out=document.createElement('canvas');
 out.width=Math.max(1,Math.round(cssW*dpr));out.height=Math.max(1,Math.round(cssH*dpr));
 out.style.width=cssW+'px';out.style.height=cssH+'px';out.className='sharpCleanCanvas';
 const g=out.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=false;g.drawImage(srcCanvas,0,0,out.width,out.height);
 return out;
}
function showSharpCleanPreview(){
 if(!cleanCanvas)return;
 const box=$('#cleanPreview');box.innerHTML='';box.appendChild(makeSharpPreviewCanvas(cleanCanvas));
}


function makeHQTraceData(imgd){
 if(!$('#penFix')||!$('#penFix').checked)return imgd;
 const long=Math.max(imgd.width,imgd.height);
 // Low-resolution screenshots need more geometry resolution than the clean preview.
 // 4x is capped for mobile memory; the result is snapped back to exact palette RGB.
 const target=Math.min(3200,Math.max(long,Math.round(long*4)));
 if(target<=long+8)return imgd;
 const sc=target/long,w=Math.max(1,Math.round(imgd.width*sc)),h=Math.max(1,Math.round(imgd.height*sc));
 const src=canvasFrom(imgd),c=document.createElement('canvas');c.width=w;c.height=h;
 const g=c.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
 g.drawImage(src,0,0,w,h);
 const d=g.getImageData(0,0,w,h),a=d.data;
 // Re-quantize interpolation pixels to the same solid palette.
 for(let i=0;i<a.length;i+=4){
   if(a[i+3]<16){a[i+3]=0;continue}
   let bi=0,bd=Infinity;
   for(let k=0;k<palette.length;k++){
     const q=palette[k],dr=a[i]-q.r,dg=a[i+1]-q.g,db=a[i+2]-q.b,dd=dr*dr*1.15+dg*dg*1.35+db*db*.9;
     if(dd<bd){bd=dd;bi=k}
   }
   const q=palette[bi];a[i]=q.r;a[i+1]=q.g;a[i+2]=q.b;a[i+3]=255;
 }
 return d;
}

function traceOptions(){
 const curve=+$('#curve').value,solid=+$('#solid').value;let lt=.72+(100-curve)*.012,qt=.34+(100-curve)*.009,pathomit=Math.max(0,Math.round(solid/24));
 if(preset==='printer'){lt=.05+(100-curve)*.003;qt=.3+(100-curve)*.04;pathomit=0}if(preset==='sharp'){lt=.2+(100-curve)*.04;qt=.12+(100-curve)*.025;pathomit=0}if(preset==='detail'){lt=.12+(100-curve)*.02;qt=.10+(100-curve)*.015;pathomit=0}if(preset==='scan'){lt=.5+(100-curve)*.06;qt=.25+(100-curve)*.03}
 const penOn=$('#penFix')&&$('#penFix').checked,pen=+($('#penStrength')?$('#penStrength').value:0);
 let linefilter=false,rightangles=(preset==='sharp'),blurRadius=0,blurDelta=20;
 if(penOn){
   // SHAPE LOCK: preserve Clean Solid silhouette first. No trace-time blur, no linefilter.
   // Conservative tolerances reduce drift while quadratic fitting still removes pixel stair-steps.
   lt=.085+(100-pen)*.00135;
   qt=.22+(100-pen)*.0036;
   linefilter=false;
   rightangles=false;
   blurRadius=0;
   blurDelta=20;
   pathomit=0;
 }
 const shared=$('#sharedBoundary')&&$('#sharedBoundary').checked;
 return{pal:palette.map(c=>({...c})),colorsampling:0,numberofcolors:palette.length,colorquantcycles:1,mincolorratio:0,layering:shared?1:0,pathomit,rightangleenhance:rightangles,strokewidth:0,linefilter,scale:1,roundcoords:3,viewbox:true,desc:false,blurradius:blurRadius,blurdelta:blurDelta,ltres:lt,qtres:qt}
}
function enhanceSvg(s){
 const doc=new DOMParser().parseFromString(s,'image/svg+xml'),root=doc.documentElement;root.setAttribute('shape-rendering','geometricPrecision');root.setAttribute('preserveAspectRatio','xMidYMid meet');
 return new XMLSerializer().serializeToString(root)
}
function renderPalette(){
 const box=$('#palette');box.innerHTML='';palette.forEach((c,i)=>{const d=document.createElement('div');d.className='swatch';d.style.background=hex(c);d.innerHTML='<small>'+hex(c).toUpperCase()+'</small><input type="color" value="'+hex(c)+'">';d.querySelector('input').oninput=e=>{palette[i]={...parseHex(e.target.value),a:255};d.style.background=e.target.value;d.querySelector('small').textContent=e.target.value.toUpperCase()};box.appendChild(d)})
}
function stats(ms){const m=svg.match(/<path\b/g);$('#pathCount').textContent=m?m.length:0;$('#svgSize').textContent=fmtBytes(new Blob([svg]).size);$('#outColors').textContent=palette.length;$('#processTime').textContent=ms?(ms/1000).toFixed(1)+'s':'—'}

async function processAll(){
 if(!srcImg)return;const start=performance.now();$('#convertBtn').disabled=true;setButtons(false);
 try{
   status('1/6 High-resolution supersampling…','busy');await sleep(20);const c=sourceCanvas(),g=c.getContext('2d',{willReadFrequently:true});let imgd=g.getImageData(0,0,c.width,c.height);
   const paletteSource=new ImageData(new Uint8ClampedArray(imgd.data),imgd.width,imgd.height);
   status('2/6 Lighting aur texture clean ho raha hai…','busy');autoLevels(imgd,+$('#levels').value);edgeAwareSmooth(imgd,+$('#noise').value);await sleep(20);
   status('3/6 Flat Color Lock — edge halo reject karke real palette detect ho rahi hai…','busy');
   const palData=($('#exactPalette')&&$('#exactPalette').checked)?paletteSource:imgd;
   palette=$('#colors').value==='auto'?autoPalette(palData):fixedPalette(palData,+$('#colors').value);
   $('#colorStat').textContent=$('#colors').value==='auto'?(palette.length+' auto ✓'):palette.length;
   const q=quantize(imgd,palette);indexMap=q.map;microProtectMask=buildMicroProtectMask(indexMap,imgd.width,imgd.height,palette.length);
   smoothClassMap(imgd,indexMap,q.confidence,+$('#solid').value);
   adaptiveCurveFair(imgd,indexMap,q.confidence,+$('#penStrength').value);
   const sym=autoSymmetryAssist(imgd,indexMap,q.confidence);
   if(preset==='scan')polishLabels(imgd,indexMap,+$('#solid').value);
   if($('#penFix').checked){
     status('4/6 Pen Tool line polish — jagged edge clean ho rahi hai…','busy');
     penToolShapeFix(imgd,indexMap,+$('#penStrength').value);
     refineBoundaryLines(imgd,indexMap,+$('#penStrength').value);
   }
   transparentBg(imgd);await sleep(20);
   status('5/6 Original details preserve ho rahe hain…','busy');dotShapes=[];cleanData=new ImageData(new Uint8ClampedArray(imgd.data),imgd.width,imgd.height);cleanCanvas=canvasFrom(cleanData);showSharpCleanPreview();renderPalette();await sleep(20);
   status('6/6 Vector Graph Lite — geometry fit aur curve fairing apply ho rahi hai…','busy');const traceData=makeHQTraceData(imgd);svg=enhanceSvg(ImageTracer.imagedataToSVG(traceData,traceOptions()));svg=enhanceVectorGraphSvg(svg,traceData);$('#vectorPreview').innerHTML=svg;setButtons(true);stats(performance.now()-start);status('Done — Textile Pro Auto ready: '+palette.length+' solid colours, anti-alias reject, shape lock + HQ trace.','good')
 }catch(e){console.error(e);status('Error: '+(e.message||e),'bad')}finally{$('#convertBtn').disabled=false}
}
$('#convertBtn').onclick=processAll;

function rebuild(){
 if(!cleanData||!indexMap)return;const d=new ImageData(new Uint8ClampedArray(cleanData.data),cleanData.width,cleanData.height);
 for(let p=0,i=0;p<indexMap.length;p++,i+=4){const q=indexMap[p];if(q===65535){d.data[i+3]=0;continue}const c=palette[q]||palette[0];d.data[i]=c.r;d.data[i+1]=c.g;d.data[i+2]=c.b}
 cleanData=d;cleanCanvas=canvasFrom(d);showSharpCleanPreview();const traceData=makeHQTraceData(d);svg=enhanceSvg(ImageTracer.imagedataToSVG(traceData,traceOptions()));svg=enhanceVectorGraphSvg(svg,traceData);$('#vectorPreview').innerHTML=svg;renderPalette();stats(0);status('Palette changes + Vector Graph Core apply ho gaye.','good')
}
$('#rebuild').onclick=rebuild;
$('#merge').onclick=()=>{
 if(palette.length<3)return;const old=palette,used=new Array(old.length).fill(false),out=[],remap=new Array(old.length);
 for(let i=0;i<old.length;i++){if(used[i])continue;let group=[i];used[i]=true;for(let j=i+1;j<old.length;j++)if(!used[j]&&d2(old[i],old[j])<1500){used[j]=true;group.push(j)}
   let r=0,g=0,b=0;group.forEach(k=>{r+=old[k].r;g+=old[k].g;b+=old[k].b});const ni=out.length;out.push({r:Math.round(r/group.length),g:Math.round(g/group.length),b:Math.round(b/group.length),a:255});group.forEach(k=>remap[k]=ni)
 }
 for(let i=0;i<indexMap.length;i++)if(indexMap[i]!==65535)indexMap[i]=remap[indexMap[i]];dotShapes.forEach(q=>q.color=remap[q.color]);palette=out;$('#colorStat').textContent=palette.length;rebuild()
};

function download(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},60000)}

function makePhotoshopSvg(source){
 if(!source)throw new Error('Pehle vectorize kijiye.');
 const doc=new DOMParser().parseFromString(source,'image/svg+xml'),root=doc.documentElement;
 if(root.nodeName.toLowerCase()==='parsererror')throw new Error('SVG parse failed');
 root.setAttribute('xmlns','http://www.w3.org/2000/svg');
 root.setAttribute('version','1.1');
 root.setAttribute('shape-rendering','geometricPrecision');
 root.setAttribute('preserveAspectRatio','xMidYMid meet');

 const vb=(root.getAttribute('viewBox')||'').trim().split(/\s+/).map(Number);
 if(vb.length===4&&vb.every(Number.isFinite)){
   root.setAttribute('width',Math.max(1,Math.round(vb[2]))+'px');
   root.setAttribute('height',Math.max(1,Math.round(vb[3]))+'px');
 }else{
   const w=parseFloat(root.getAttribute('width'))||cleanData?.width||1000;
   const h=parseFloat(root.getAttribute('height'))||cleanData?.height||1000;
   root.setAttribute('viewBox','0 0 '+w+' '+h);
   root.setAttribute('width',Math.round(w)+'px');
   root.setAttribute('height',Math.round(h)+'px');
 }

 // Keep the file deliberately plain: no CSS classes, data attributes, paint-order,
 // vector-effect or metadata that older Adobe importers may reject.
 root.querySelectorAll('*').forEach(el=>{
   [...el.attributes].forEach(a=>{
     if(a.name.startsWith('data-')||a.name==='paint-order'||a.name==='vector-effect'||a.name==='class'||a.name==='style')el.removeAttribute(a.name);
   });
   const fill=el.getAttribute('fill');
   const stroke=el.getAttribute('stroke');
   // v5 gap filler uses a same-colour micro stroke. Remove it from Photoshop export;
   // shared geometry remains in the filled vector paths and this avoids Adobe stroke quirks.
   if(fill&&stroke&&fill.toLowerCase()===stroke.toLowerCase()){
     el.removeAttribute('stroke');el.removeAttribute('stroke-width');el.removeAttribute('stroke-linejoin');el.removeAttribute('stroke-linecap');
   }
 });
 root.querySelectorAll('metadata,title,desc').forEach(n=>n.remove());

 const body=new XMLSerializer().serializeToString(root);
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
   '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n'+body;
}

function psNum(v){return Number(v.toFixed(4)).toString()}
function psColour(fill){
 const ctx=document.createElement('canvas').getContext('2d');ctx.fillStyle='#000';ctx.fillStyle=fill||'#000';
 const c=ctx.fillStyle;
 let r=0,g=0,b=0;
 if(c[0]==='#'){
   if(c.length===4){r=parseInt(c[1]+c[1],16);g=parseInt(c[2]+c[2],16);b=parseInt(c[3]+c[3],16)}
   else{r=parseInt(c.slice(1,3),16);g=parseInt(c.slice(3,5),16);b=parseInt(c.slice(5,7),16)}
 }else{
   const m=c.match(/[\d.]+/g)||[0,0,0];r=+m[0];g=+m[1];b=+m[2];
 }
 return [r/255,g/255,b/255];
}
function pathTokens(d){
 return (d||'').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)||[];
}
function svgPathToPS(d){
 const t=pathTokens(d),out=['newpath'];let i=0,cmd='',x=0,y=0,sx=0,sy=0,cx=0,cy=0,lastQx=0,lastQy=0;
 const isCmd=v=>/^[a-zA-Z]$/.test(v);
 const num=()=>+t[i++];
 while(i<t.length){
   if(isCmd(t[i]))cmd=t[i++];
   if(!cmd)break;
   const rel=cmd===cmd.toLowerCase(),C=cmd.toUpperCase();
   if(C==='M'){
     let nx=num(),ny=num();if(rel){nx+=x;ny+=y}x=nx;y=ny;sx=x;sy=y;out.push(psNum(x)+' '+psNum(y)+' moveto');
     cmd=rel?'l':'L';
   }else if(C==='L'){
     let nx=num(),ny=num();if(rel){nx+=x;ny+=y}x=nx;y=ny;out.push(psNum(x)+' '+psNum(y)+' lineto');
   }else if(C==='H'){
     let nx=num();if(rel)nx+=x;x=nx;out.push(psNum(x)+' '+psNum(y)+' lineto');
   }else if(C==='V'){
     let ny=num();if(rel)ny+=y;y=ny;out.push(psNum(x)+' '+psNum(y)+' lineto');
   }else if(C==='C'){
     let x1=num(),y1=num(),x2=num(),y2=num(),x3=num(),y3=num();
     if(rel){x1+=x;y1+=y;x2+=x;y2+=y;x3+=x;y3+=y}
     out.push([x1,y1,x2,y2,x3,y3].map(psNum).join(' ')+' curveto');cx=x2;cy=y2;x=x3;y=y3;
   }else if(C==='S'){
     let x2=num(),y2=num(),x3=num(),y3=num();let x1=2*x-cx,y1=2*y-cy;
     if(rel){x2+=x;y2+=y;x3+=x;y3+=y}
     out.push([x1,y1,x2,y2,x3,y3].map(psNum).join(' ')+' curveto');cx=x2;cy=y2;x=x3;y=y3;
   }else if(C==='Q'){
     let qx=num(),qy=num(),x2=num(),y2=num();if(rel){qx+=x;qy+=y;x2+=x;y2+=y}
     const c1x=x+2/3*(qx-x),c1y=y+2/3*(qy-y),c2x=x2+2/3*(qx-x2),c2y=y2+2/3*(qy-y2);
     out.push([c1x,c1y,c2x,c2y,x2,y2].map(psNum).join(' ')+' curveto');lastQx=qx;lastQy=qy;x=x2;y=y2;
   }else if(C==='T'){
     let x2=num(),y2=num();if(rel){x2+=x;y2+=y}const qx=2*x-lastQx,qy=2*y-lastQy;
     const c1x=x+2/3*(qx-x),c1y=y+2/3*(qy-y),c2x=x2+2/3*(qx-x2),c2y=y2+2/3*(qy-y2);
     out.push([c1x,c1y,c2x,c2y,x2,y2].map(psNum).join(' ')+' curveto');lastQx=qx;lastQy=qy;x=x2;y=y2;
   }else if(C==='Z'){
     out.push('closepath');x=sx;y=sy;cmd='';continue;
   }else if(C==='A'){
     // Current default engine does not emit arc path commands. If one appears,
     // skip that segment safely; circles/ellipses are exported separately below.
     num();num();num();num();num();let nx=num(),ny=num();if(rel){nx+=x;ny+=y}x=nx;y=ny;out.push(psNum(x)+' '+psNum(y)+' lineto');
   }else{
     break;
   }
 }
 return out.join('\n');
}
function circleToPS(cx,cy,rx,ry){
 const k=.5522847498307936;
 return ['newpath',
   psNum(cx+rx)+' '+psNum(cy)+' moveto',
   [cx+rx,cy+k*ry,cx+k*rx,cy+ry,cx,cy+ry].map(psNum).join(' ')+' curveto',
   [cx-k*rx,cy+ry,cx-rx,cy+k*ry,cx-rx,cy].map(psNum).join(' ')+' curveto',
   [cx-rx,cy-k*ry,cx-k*rx,cy-ry,cx,cy-ry].map(psNum).join(' ')+' curveto',
   [cx+k*rx,cy-ry,cx+rx,cy-k*ry,cx+rx,cy].map(psNum).join(' ')+' curveto','closepath'].join('\n');
}
function polygonToPS(points,close=true){
 const nums=(points||'').trim().split(/[ ,]+/).map(Number).filter(Number.isFinite);if(nums.length<4)return '';
 const out=['newpath',psNum(nums[0])+' '+psNum(nums[1])+' moveto'];
 for(let i=2;i+1<nums.length;i+=2)out.push(psNum(nums[i])+' '+psNum(nums[i+1])+' lineto');
 if(close)out.push('closepath');return out.join('\n');
}
function makePhotoshopEps(source){
 const clean=makePhotoshopSvg(source),doc=new DOMParser().parseFromString(clean,'image/svg+xml'),root=doc.documentElement;
 const vb=(root.getAttribute('viewBox')||'0 0 1000 1000').trim().split(/\s+/).map(Number);
 const vx=vb[0]||0,vy=vb[1]||0,w=vb[2]||1000,h=vb[3]||1000;
 const out=['%!PS-Adobe-3.0 EPSF-3.0','%%Creator: Vector Converter Pro v5.5','%%Title: Photoshop CS6 Textile Vector','%%BoundingBox: 0 0 '+Math.ceil(w)+' '+Math.ceil(h),'%%LanguageLevel: 2','%%Pages: 1','%%EndComments','gsave','0 '+psNum(h)+' translate','1 -1 scale',psNum(-vx)+' '+psNum(-vy)+' translate'];
 root.querySelectorAll('path,circle,ellipse,rect,polygon,polyline').forEach(el=>{
   const fill=el.getAttribute('fill');if(!fill||fill==='none')return;
   let shape='';
   if(el.tagName==='path')shape=svgPathToPS(el.getAttribute('d')||'');
   else if(el.tagName==='circle')shape=circleToPS(+el.getAttribute('cx')||0,+el.getAttribute('cy')||0,+el.getAttribute('r')||0,+el.getAttribute('r')||0);
   else if(el.tagName==='ellipse')shape=circleToPS(+el.getAttribute('cx')||0,+el.getAttribute('cy')||0,+el.getAttribute('rx')||0,+el.getAttribute('ry')||0);
   else if(el.tagName==='rect'){
     const x=+el.getAttribute('x')||0,y=+el.getAttribute('y')||0,rw=+el.getAttribute('width')||0,rh=+el.getAttribute('height')||0;
     shape=polygonToPS([x,y,x+rw,y,x+rw,y+rh,x,y+rh].join(' '),true);
   }else shape=polygonToPS(el.getAttribute('points')||'',el.tagName==='polygon');
   if(!shape)return;
   const col=psColour(fill);out.push('gsave',col.map(psNum).join(' ')+' setrgbcolor',shape,'fill','grestore');
 });
 out.push('grestore','showpage','%%EOF');
 return out.join('\n');
}

$('#svgBtn').onclick=()=>svg&&download('textile-vector-standard.svg',new Blob([svg],{type:'image/svg+xml'}));
$('#psSvgBtn').onclick=$('#topSvg').onclick=()=>{
 try{download('textile-vector-photoshop.svg',new Blob([makePhotoshopSvg(svg)],{type:'image/svg+xml'}));status('Photoshop SVG 1.1 download shuru.','good')}
 catch(e){status(e.message,'bad')}
};
$('#epsBtn').onclick=()=>{
 try{download('textile-vector-photoshop-cs6.eps',new Blob([makePhotoshopEps(svg)],{type:'application/postscript'}));status('Photoshop CS6 EPS download shuru.','good')}
 catch(e){status('EPS export error: '+e.message,'bad')}
};
function pngTargetLong(){return +($('#pngResolution')&&$('#pngResolution').value)||4096}
function canvasSizeForLong(targetLong){
 const w=cleanData?cleanData.width:cleanCanvas.width,h=cleanData?cleanData.height:cleanCanvas.height,long=Math.max(w,h),sc=targetLong/long;
 return {w:Math.max(1,Math.round(w*sc)),h:Math.max(1,Math.round(h*sc))};
}
function snapCanvasToPalette(c){
 if(!$('#hardMainPng')||!$('#hardMainPng').checked||!palette.length)return;
 const g=c.getContext('2d',{willReadFrequently:true}),d=g.getImageData(0,0,c.width,c.height),a=d.data;
 for(let i=0;i<a.length;i+=4){
  if(a[i+3]<16){a[i+3]=0;continue}
  let bi=0,bd=Infinity;
  for(let k=0;k<palette.length;k++){const q=palette[k],dr=a[i]-q.r,dg=a[i+1]-q.g,db=a[i+2]-q.b,dd=dr*dr+dg*dg+db*db;if(dd<bd){bd=dd;bi=k}}
  const q=palette[bi];a[i]=q.r;a[i+1]=q.g;a[i+2]=q.b;a[i+3]=255;
 }
 g.putImageData(d,0,0);
}
async function vectorPngCanvas(){
 if(!svg||!cleanCanvas)throw new Error('Pehle vectorize kijiye.');
 const target=pngTargetLong(),sz=canvasSizeForLong(target),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{
  const im=new Image();await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(new Error('SVG render failed'));im.src=url});
  const c=document.createElement('canvas');c.width=sz.w;c.height=sz.h;
  const g=c.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(im,0,0,c.width,c.height);
  snapCanvasToPalette(c);return c;
 }finally{URL.revokeObjectURL(url)}
}
$('#pngBtn').onclick=async()=>{
 if(!svg)return;
 const button=$('#pngBtn');button.disabled=true;
 try{
  const c=await vectorPngCanvas(),blob=await new Promise(r=>c.toBlob(r,'image/png'));if(!blob)throw new Error('PNG export failed');
  download('textile-vector-'+Math.max(c.width,c.height)+'px-sharp.png',blob);
  status('Sharp PNG '+c.width+'×'+c.height+' download shuru ho gaya.','good');
 }catch(e){status('PNG export error: '+e.message+' — 2K try karein ya SVG download karein.','bad')}finally{button.disabled=false}
};
$('#copyBtn').onclick=async()=>{if(!svg)return;try{await navigator.clipboard.writeText(makePhotoshopSvg(svg));status('Photoshop-safe SVG code copied.','good')}catch{status('Copy blocked — SVG Download use kijiye.','bad')}};
$('#resetBtn').onclick=()=>{srcImg=null;srcUrl='';srcFile=null;cleanCanvas=null;cleanData=null;palette=[];indexMap=null;svg='';dotShapes=[];microProtectMask=null;lastAutoColourCount=0;$('#file').value='';$('#original').innerHTML='<div class="empty">Original image yahan dikhegi</div>';$('#cmpOriginal').innerHTML='<div class="empty">Upload image</div>';$('#cleanPreview').innerHTML='<div class="empty">Vectorize dabao</div>';$('#vectorPreview').innerHTML='<div class="empty">Vector result</div>';$('#palette').innerHTML='<span class="sub">Result ke baad palette aayegi.</span>';$('#dim').textContent=$('#size').textContent='—';$('#convertBtn').disabled=true;setButtons(false);['pathCount','svgSize','outColors','processTime'].forEach(id=>$('#'+id).textContent='—');$('#penFix').checked=true;$('#penStrength').value=48;$('#protectDetails').checked=true;$('#adaptiveFair').checked=true;$('#autoSymmetry').checked=true;$('#perfectCircles').checked=false;$('#gapFiller').checked=true;$('#exactPalette').checked=true;$('#sharedBoundary').checked=true;$('#microProtect').checked=true;$('#smartAutoColors').checked=true;$('#flatColorLock').checked=true;$('#antiAliasReject').checked=true;applyPreset('printer');status('Reset done.')};

$('#exactPalette').checked=true;$('#sharedBoundary').checked=true;$('#microProtect').checked=true;$('#smartAutoColors').checked=true;$('#flatColorLock').checked=true;$('#antiAliasReject').checked=true;$('#adaptiveFair').checked=true;$('#autoSymmetry').checked=true;$('#gapFiller').checked=true;$('#perfectCircles').checked=false;$('#penStrength').value=48;applyPreset('printer');sync();