importScripts('./imagetracer_v1.2.6.js');
self.onmessage=function(e){
  const d=e.data||{},id=d.id;
  try{
    const imgd={width:d.width,height:d.height,data:new Uint8ClampedArray(d.data)};
    const svg=ImageTracer.imagedataToSVG(imgd,d.options||{});
    self.postMessage({id:id,ok:true,svg:svg});
  }catch(err){
    self.postMessage({id:id,ok:false,error:(err&&err.message)||String(err)});
  }
};