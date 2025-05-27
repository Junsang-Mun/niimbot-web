// lib/printer.js

import { createPacket, encodeImage, Commands } from "./packet.js";
import { WebUSBTransport } from "./transport-usb.js";
import { WebBLETransport } from "./transport-ble.js";

/**
 * Convert a canvas to 1-bit-per-pixel bitmap data
 * @param {HTMLCanvasElement} canvas
 * @param {number} density - density level (1-5)
 * @returns {{ bits: Uint8Array, width: number }}
 */
export function getMonoBits(canvas, density = 3) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height).data;
  const bytesPerRow = Math.ceil(width / 8);
  const bits = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = imageData[idx],
        g = imageData[idx + 1],
        b = imageData[idx + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      // threshold based on density
      const threshold = 256 - density * 40;
      const bit = gray < threshold ? 1 : 0;
      const byteIndex = y * bytesPerRow + (x >> 3);
      bits[byteIndex] |= bit << (7 - (x & 7));
    }
  }

  return { bits, width };
}

/**
 * Print a canvas via USB transport
 * @param {HTMLCanvasElement} canvas
 * @param {{density?: number, rotate?: number}} opts
 */
export async function printViaUSB(canvas, opts = {}) {
  const density = opts.density ?? 3;
  const rotate = opts.rotate ?? 0;
  const { bits, width } = getMonoBits(canvas, density);
  const packets = encodeImage(bits, width, { density, rotate });

  const transport = await WebUSBTransport.requestDevice();
  try {
    for (const pkt of packets) {
      await transport.write(pkt);
      // optional small delay: await sleep(50);
    }
  } finally {
    await transport.close();
  }
}

/**
 * Print a canvas via BLE transport
 * @param {HTMLCanvasElement} canvas
 * @param {{density?: number, rotate?: number}} opts
 */
export async function printViaBLE(canvas, opts = {}) {
  const density = opts.density ?? 3;
  const rotate = opts.rotate ?? 0;
  const { bits, width } = getMonoBits(canvas, density);
  const packets = encodeImage(bits, width, { density, rotate });

  const transport = await WebBLETransport.requestDevice();
  try {
    for (const pkt of packets) {
      await transport.write(pkt);
      // optional small delay: await sleep(50);
    }
  } finally {
    await transport.close();
  }
}

/** Sleep for given milliseconds */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
