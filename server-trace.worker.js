const { parentPort } = require('worker_threads');
const ImageTracer = require('./public/imagetracer_v1.2.6.js');

parentPort.on('message', (msg) => {
  const id = msg && msg.id;
  try {
    const imgd = {
      width: msg.width,
      height: msg.height,
      data: new Uint8ClampedArray(msg.data)
    };
    const svg = ImageTracer.imagedataToSVG(imgd, msg.options || {});
    parentPort.postMessage({ id, ok: true, svg });
  } catch (err) {
    parentPort.postMessage({ id, ok: false, error: (err && err.message) || String(err) });
  }
});
