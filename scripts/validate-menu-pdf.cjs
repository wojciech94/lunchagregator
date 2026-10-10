// Isolated parsing: the caller terminates this worker after five seconds.
const { parentPort, workerData } = require('node:worker_threads');
const { PDFDocument } = require('pdf-lib');
(async () => {
  try {
    const doc = await PDFDocument.load(workerData, { throwOnInvalidObject: true, updateMetadata: false });
    if (doc.isEncrypted || doc.getPageCount() !== 1) throw new Error('Unsupported PDF');
    const { width, height } = doc.getPage(0).getSize();
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 2000 || height > 2000) {
      throw new Error('Unsupported page dimensions');
    }
    parentPort.postMessage(true);
  } catch { parentPort.postMessage(false); }
})();
