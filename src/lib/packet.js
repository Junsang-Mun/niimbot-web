// lib/packet.js - Full implementation of Niimbot packet logic

/**
 * Niimbot packet types and utility functions ported from Python niimprint
 */

// Command codes
export const Commands = {
  START_PRINT: 0x01,
  START_PAGE: 0x03,
  SET_DIMENSION: 0x13,
  SET_DENSITY: 0x21,
  SET_LABEL_TYPE: 0x23,
  IMAGE_ROW: 0x85,
  END_PAGE: 0xe3,
  END_PRINT: 0xf3,
};

/**
 * Create a Niimbot command packet
 * @param {number} cmd - command code
 * @param {Uint8Array} payload - payload bytes
 * @returns {Uint8Array} packet bytes
 */
export function createPacket(cmd, payload = new Uint8Array()) {
  const HEADER = [0x51, 0x78];
  const length = payload.length;
  const packet = new Uint8Array(7 + length);
  packet.set(HEADER, 0);
  packet[2] = cmd;
  packet[3] = length;
  packet.set(payload, 4);
  // checksum: sum of bytes 0 to 3+length
  let sum = 0;
  for (let i = 0; i < 4 + length; i++) sum += packet[i];
  packet[4 + length] = (sum >> 8) & 0xff;
  packet[5 + length] = sum & 0xff;
  packet[6 + length] = 0x0a;
  return packet;
}

/**
 * Split image bits into line packets
 * @param {Uint8Array} bits - 1-bit-per-pixel packed image (rows concatenated)
 * @param {number} width - image width in pixels
 * @param {object} opts - options: density, rotate
 * @returns {Uint8Array[]} array of full packets ready to send
 */
export function encodeImage(bits, width, { density = 3, rotate = 0 } = {}) {
  const packets = [];
  const bytesPerRow = Math.ceil(width / 8);
  const height = bits.length / bytesPerRow;
  // set density before printing image
  packets.push(createPacket(Commands.SET_DENSITY, new Uint8Array([density])));
  // start print
  packets.push(createPacket(Commands.START_PRINT, new Uint8Array([1])));
  // start page
  packets.push(createPacket(Commands.START_PAGE, new Uint8Array([1])));
  // dimension: width and height in pixels (big-endian)
  const dim = new Uint8Array(4);
  dim[0] = (height >> 8) & 0xff;
  dim[1] = height & 0xff;
  dim[2] = (width >> 8) & 0xff;
  dim[3] = width & 0xff;
  packets.push(createPacket(Commands.SET_DIMENSION, dim));
  // image rows
  for (let row = 0; row < height; row++) {
    const offset = row * bytesPerRow;
    const rowBytes = bits.slice(offset, offset + bytesPerRow);
    // row header: y pos (2), 0x00*3, 0x01
    const header = new Uint8Array(6);
    header[0] = (row >> 8) & 0xff;
    header[1] = row & 0xff;
    // header[2..4] = 0
    header[5] = 1;
    const payload = new Uint8Array(header.length + rowBytes.length);
    payload.set(header, 0);
    payload.set(rowBytes, header.length);
    packets.push(createPacket(Commands.IMAGE_ROW, payload));
  }
  // end page and end print
  packets.push(createPacket(Commands.END_PAGE, new Uint8Array([1])));
  packets.push(createPacket(Commands.END_PRINT, new Uint8Array([1])));
  return packets;
}
