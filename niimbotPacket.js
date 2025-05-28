class NiimbotPacket {
  /**
   * @param {number} type - Packet type (0-255)
   * @param {Uint8Array} data - Payload bytes
   */
  constructor(type, data) {
    this.type = type;
    this.data = data;
  }

  /**
   * Parse a raw byte buffer into a NiimbotPacket
   * @param {Uint8Array | ArrayBuffer} buffer
   * @returns {NiimbotPacket}
   */
  static fromBytes(buffer) {
    const bytes =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

    // Header check
    if (bytes[0] !== 0x55 || bytes[1] !== 0x55) {
      throw new Error("Invalid packet header");
    }

    // Trailer check
    if (bytes[bytes.length - 2] !== 0xaa || bytes[bytes.length - 1] !== 0xaa) {
      throw new Error("Invalid packet trailer");
    }

    const type = bytes[2];
    const length = bytes[3];
    const data = bytes.slice(4, 4 + length);

    // Checksum calculation
    let checksum = type ^ length;
    for (let b of data) checksum ^= b;

    // Compare against the checksum byte (just before trailer)
    if (checksum !== bytes[bytes.length - 3]) {
      throw new Error("Checksum mismatch");
    }

    return new NiimbotPacket(type, data);
  }

  /**
   * Serialize this packet into raw bytes
   * @returns {Uint8Array}
   */
  toBytes() {
    const totalLength = 2 + 1 + 1 + this.data.length + 1 + 2;
    const bytes = new Uint8Array(totalLength);

    // Header
    bytes[0] = 0x55;
    bytes[1] = 0x55;

    // Type and Length
    bytes[2] = this.type;
    bytes[3] = this.data.length;

    // Payload
    bytes.set(this.data, 4);

    // Checksum
    let checksum = this.type ^ this.data.length;
    for (let b of this.data) checksum ^= b;
    bytes[4 + this.data.length] = checksum;

    // Trailer
    bytes[totalLength - 2] = 0xaa;
    bytes[totalLength - 1] = 0xaa;

    return bytes;
  }

  /**
   * Human-readable representation for debugging
   */
  toString() {
    const hexData = Array.from(this.data)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    return `<NiimbotPacket type=0x${this.type.toString(16)} data=[${hexData}]>`;
  }
}

// For module environments (ESM)
export default NiimbotPacket;

// ------------------- Usage Example -------------------
// const pkt = new NiimbotPacket(0x01, new Uint8Array([0x10, 0x20]));
// const raw = pkt.toBytes();
// console.log(raw);
// const parsed = NiimbotPacket.fromBytes(raw);
// console.log(parsed.toString());
