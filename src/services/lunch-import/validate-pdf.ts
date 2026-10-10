import { Worker } from 'node:worker_threads';
import { join } from 'node:path';

/** Byte, memory and wall-clock bounds apply before passing the file to AI. */
export async function validateMenuPdf(bytes: Buffer) {
  if (bytes.length > 2 * 1024 * 1024 || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('Wymagany poprawny PDF do 2 MB.');
  }
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(join(process.cwd(), 'scripts/validate-menu-pdf.cjs'), {
      workerData: bytes, resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 },
    });
    let settled = false;
    const finish = (valid: boolean) => {
      if (settled) return;
      settled = true; clearTimeout(timer); void worker.terminate();
      if (valid) resolve();
      else reject(new Error('Wymagany niezaszyfrowany, jednostronicowy PDF o wymiarach do 2000 punktów. Odczyt nie powiódł się lub przekroczył limit 5 sekund.'));
    };
    const timer = setTimeout(() => finish(false), 5000);
    worker.once('message', value => finish(value === true));
    worker.once('error', () => finish(false));
    worker.once('exit', () => finish(false));
  });
}
