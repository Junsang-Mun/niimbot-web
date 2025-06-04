// niimbot-web.js - Web implementation of Niimbot printer control

// Packet implementation
class NiimbotPacket {
  constructor(type, data) {
    this.type = type;
    this.data = new Uint8Array(data);
  }

  static fromBytes(buffer) {
    const view = new Uint8Array(buffer);

    // Check header and footer
    if (view[0] !== 0x55 || view[1] !== 0x55) {
      throw new Error("Invalid packet header");
    }
    if (view[view.length - 2] !== 0xaa || view[view.length - 1] !== 0xaa) {
      throw new Error("Invalid packet footer");
    }

    const type = view[2];
    const length = view[3];
    const data = view.slice(4, 4 + length);

    // Verify checksum
    let checksum = type ^ length;
    for (let i = 0; i < data.length; i++) {
      checksum ^= data[i];
    }
    if (checksum !== view[view.length - 3]) {
      throw new Error("Checksum mismatch");
    }

    return new NiimbotPacket(type, data);
  }

  toBytes() {
    let checksum = this.type ^ this.data.length;
    for (let i = 0; i < this.data.length; i++) {
      checksum ^= this.data[i];
    }

    const packet = new Uint8Array(this.data.length + 7);
    packet[0] = 0x55;
    packet[1] = 0x55;
    packet[2] = this.type;
    packet[3] = this.data.length;
    packet.set(this.data, 4);
    packet[packet.length - 3] = checksum;
    packet[packet.length - 2] = 0xaa;
    packet[packet.length - 1] = 0xaa;

    return packet;
  }

  toString() {
    return `NiimbotPacket(type=${this.type}, data=[${Array.from(this.data).join(", ")}])`;
  }
}

// Transport interfaces
class BaseTransport {
  async read(length) {
    throw new Error("Not implemented");
  }

  async write(data) {
    throw new Error("Not implemented");
  }

  async connect() {
    throw new Error("Not implemented");
  }

  async disconnect() {
    throw new Error("Not implemented");
  }
}

// WebUSB Transport
class WebUSBTransport extends BaseTransport {
  constructor() {
    super();
    this.device = null;
    this.interface = null;
    this.endpoint = null;
  }

  async connect() {
    try {
      // Request device - you'll need to adjust the filters based on your printer's USB descriptors
      this.device = await navigator.usb.requestDevice({
        filters: [
          { vendorId: 0x0000 }, // Replace with actual vendor ID
          // Add more specific filters as needed
        ],
      });

      await this.device.open();

      // Select configuration (usually 1)
      await this.device.selectConfiguration(1);

      // Claim interface (usually 0)
      await this.device.claimInterface(0);

      // Find bulk out endpoint
      const interface = this.device.configuration.interfaces[0];
      this.endpoint = interface.alternate.endpoints.find(
        (ep) => ep.direction === "out" && ep.type === "bulk",
      );

      if (!this.endpoint) {
        throw new Error("No suitable endpoint found");
      }

      console.log("WebUSB connected successfully");
    } catch (error) {
      console.error("WebUSB connection failed:", error);
      throw error;
    }
  }

  async write(data) {
    if (!this.device || !this.endpoint) {
      throw new Error("Device not connected");
    }

    const result = await this.device.transferOut(
      this.endpoint.endpointNumber,
      data,
    );
    return result.bytesWritten;
  }

  async read(length) {
    if (!this.device) {
      throw new Error("Device not connected");
    }

    // Find bulk in endpoint
    const interface = this.device.configuration.interfaces[0];
    const inEndpoint = interface.alternate.endpoints.find(
      (ep) => ep.direction === "in" && ep.type === "bulk",
    );

    if (!inEndpoint) {
      throw new Error("No input endpoint found");
    }

    const result = await this.device.transferIn(
      inEndpoint.endpointNumber,
      length,
    );
    return result.data.buffer;
  }

  async disconnect() {
    if (this.device) {
      await this.device.releaseInterface(0);
      await this.device.close();
      this.device = null;
    }
  }
}

// WebBluetooth Transport
class WebBluetoothTransport extends BaseTransport {
  constructor() {
    super();
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
  }

  async connect() {
    try {
      // Request Bluetooth device
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: "Niimbot" },
          // Add more specific filters
        ],
        optionalServices: [
          // Add the specific service UUIDs used by your printer
          "0000180f-0000-1000-8000-00805f9b34fb", // Example service UUID
        ],
      });

      console.log("Connecting to GATT Server...");
      this.server = await this.device.gatt.connect();

      // Get the service - you'll need to determine the correct service UUID
      this.service = await this.server.getPrimaryService(
        "0000180f-0000-1000-8000-00805f9b34fb",
      );

      // Get the characteristic - you'll need to determine the correct characteristic UUID
      this.characteristic = await this.service.getCharacteristic(
        "00002a19-0000-1000-8000-00805f9b34fb",
      );

      console.log("WebBluetooth connected successfully");
    } catch (error) {
      console.error("WebBluetooth connection failed:", error);
      throw error;
    }
  }

  async write(data) {
    if (!this.characteristic) {
      throw new Error("Device not connected");
    }

    await this.characteristic.writeValue(data);
  }

  async read(length) {
    if (!this.characteristic) {
      throw new Error("Device not connected");
    }

    const value = await this.characteristic.readValue();
    return value.buffer;
  }

  async disconnect() {
    if (this.server) {
      this.server.disconnect();
    }
  }
}

// Printer Client
class PrinterClient {
  constructor(transport) {
    this.transport = transport;
    this.packetBuffer = new Uint8Array();
  }

  async connect() {
    await this.transport.connect();
  }

  async disconnect() {
    await this.transport.disconnect();
  }

  async printImage(imageCanvas, density = 3) {
    try {
      await this.setLabelDensity(density);
      await this.setLabelType(1);
      await this.startPrint();
      await this.startPagePrint();

      const { width, height } = imageCanvas;
      await this.setDimension(height, width);

      // Encode and send image data
      for await (const packet of this.encodeImage(imageCanvas)) {
        await this.send(packet);
      }

      await this.endPagePrint();

      // Wait a bit then end print
      await new Promise((resolve) => setTimeout(resolve, 300));

      let printEnded = false;
      while (!printEnded) {
        printEnded = await this.endPrint();
        if (!printEnded) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      console.log("Print completed successfully");
    } catch (error) {
      console.error("Print failed:", error);
      throw error;
    }
  }

  async *encodeImage(canvas) {
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height, data } = imageData;

    for (let y = 0; y < height; y++) {
      const lineData = [];

      // Convert pixels to 1-bit data
      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * 4;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];

        // Convert to grayscale and threshold
        const grayscale = (r + g + b) / 3;
        lineData.push(grayscale < 128 ? 1 : 0);
      }

      // Pack bits into bytes
      const lineBytes = [];
      for (let i = 0; i < lineData.length; i += 8) {
        let byte = 0;
        for (let bit = 0; bit < 8 && i + bit < lineData.length; bit++) {
          if (lineData[i + bit]) {
            byte |= 1 << (7 - bit);
          }
        }
        lineBytes.push(byte);
      }

      // Create packet header
      const header = new Uint8Array(6);
      const view = new DataView(header.buffer);
      view.setUint16(0, y, false); // big endian
      view.setUint8(2, 0); // count1
      view.setUint8(3, 0); // count2
      view.setUint8(4, 0); // count3
      view.setUint8(5, 1); // flag

      const packetData = new Uint8Array(header.length + lineBytes.length);
      packetData.set(header);
      packetData.set(lineBytes, header.length);

      yield new NiimbotPacket(0x85, packetData);
    }
  }

  async send(packet) {
    const data = packet.toBytes();
    await this.transport.write(data);
  }

  async transceive(reqCode, data, respOffset = 1) {
    const respCode = respOffset + reqCode;
    const packet = new NiimbotPacket(reqCode, data);

    await this.send(packet);

    // Simple implementation - in reality you'd want proper packet parsing
    // and buffering like in the Python version
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const response = await this.transport.read(1024);
        const respPacket = NiimbotPacket.fromBytes(response);

        if (respPacket.type === respCode) {
          return respPacket;
        }
      } catch (error) {
        console.warn("Transceive attempt failed:", error);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error("No response received");
  }

  // Printer command methods
  async setLabelDensity(density) {
    const packet = await this.transceive(33, new Uint8Array([density]), 16);
    return packet.data[0] !== 0;
  }

  async setLabelType(type) {
    const packet = await this.transceive(35, new Uint8Array([type]), 16);
    return packet.data[0] !== 0;
  }

  async startPrint() {
    const packet = await this.transceive(1, new Uint8Array([1]));
    return packet.data[0] !== 0;
  }

  async endPrint() {
    const packet = await this.transceive(243, new Uint8Array([1]));
    return packet.data[0] !== 0;
  }

  async startPagePrint() {
    const packet = await this.transceive(3, new Uint8Array([1]));
    return packet.data[0] !== 0;
  }

  async endPagePrint() {
    const packet = await this.transceive(227, new Uint8Array([1]));
    return packet.data[0] !== 0;
  }

  async setDimension(width, height) {
    const data = new Uint8Array(4);
    const view = new DataView(data.buffer);
    view.setUint16(0, width, false);
    view.setUint16(2, height, false);

    const packet = await this.transceive(19, data);
    return packet.data[0] !== 0;
  }

  async getInfo(key) {
    const packet = await this.transceive(64, new Uint8Array([key]), key);
    if (packet) {
      // Handle different info types like in Python version
      switch (key) {
        case 11: // DEVICESERIAL
          return Array.from(packet.data)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        case 9: // SOFTVERSION
        case 12: // HARDVERSION
          const value = Array.from(packet.data).reduce(
            (acc, byte, i) =>
              acc + (byte << (8 * (packet.data.length - 1 - i))),
            0,
          );
          return value / 100;
        default:
          return Array.from(packet.data).reduce(
            (acc, byte, i) =>
              acc + (byte << (8 * (packet.data.length - 1 - i))),
            0,
          );
      }
    }
    return null;
  }
}

// Usage example
export { NiimbotPacket, WebUSBTransport, WebBluetoothTransport, PrinterClient };
