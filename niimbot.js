/**
 * NIIMBOT Printer Communication Functions
 * Functions for converting PNG images to NIIMBOT-compatible packets
 */

/**
 * Converts a PNG image to a NIIMBOT-compatible packet.
 * @param {string} imageUrl - The URL or path to the PNG image.
 * @param {number} width - Desired width in pixels.
 * @param {number} height - Desired height in pixels.
 * @returns {Promise<Uint8Array>} - The constructed printer packet.
 */
export async function createNiimbotPacketFromPNG(imageUrl, width, height) {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height).data;
  const bitmap = convertToMonochrome(imageData, width, height);
  const packet = constructNiimbotPacket(bitmap);
  return packet;
}

/**
 * Loads an image from a URL.
 * @param {string} src - The image source URL.
 * @returns {Promise<HTMLImageElement>} - The loaded image element.
 */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Converts RGBA image data to a monochrome bitmap.
 * @param {Uint8ClampedArray} imageData - The RGBA image data.
 * @param {number} width - Image width.
 * @param {number} height - Image height.
 * @returns {Uint8Array} - The monochrome bitmap.
 */
export function convertToMonochrome(imageData, width, height) {
  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = imageData[idx];
      const g = imageData[idx + 1];
      const b = imageData[idx + 2];
      const grayscale = 0.299 * r + 0.587 * g + 0.114 * b;
      const bit = grayscale < 128 ? 1 : 0;
      if (bit) {
        bitmap[y * bytesPerRow + (x >> 3)] |= 0x80 >> x % 8;
      }
    }
  }
  return bitmap;
}

/**
 * Constructs a NIIMBOT printer packet with the given payload.
 * @param {Uint8Array} payload - The payload data (e.g., image bitmap).
 * @returns {Uint8Array} - The complete printer packet.
 */
export function constructNiimbotPacket(payload) {
  const header = [0x55, 0x55];
  const command = 0xa2;
  const length = payload.length;
  const lengthBytes = [(length >> 8) & 0xff, length & 0xff];
  const checksum = calculateChecksum(command, lengthBytes, payload);
  const footer = [0xaa, 0xaa];
  return new Uint8Array([
    ...header,
    command,
    ...lengthBytes,
    ...payload,
    checksum,
    ...footer,
  ]);
}

/**
 * Calculates the checksum for the packet.
 * @param {number} command - The command byte.
 * @param {number[]} lengthBytes - The two length bytes.
 * @param {Uint8Array} payload - The payload data.
 * @returns {number} - The checksum byte.
 */
export function calculateChecksum(command, lengthBytes, payload) {
  let sum = command + lengthBytes[0] + lengthBytes[1];
  for (const byte of payload) {
    sum += byte;
  }
  return sum & 0xff;
}
