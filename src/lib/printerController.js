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
    this.usbInterface = null;
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
      const usbInterface = this.device.configuration.interfaces[0];
      this.endpoint = usbInterface.alternate.endpoints.find(
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
    const usbInterface = this.device.configuration.interfaces[0];
    const inEndpoint = usbInterface.alternate.endpoints.find(
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
      try {
        await this.device.releaseInterface(0);
        await this.device.close();
      } catch (error) {
        console.warn("Error during disconnect:", error);
      }
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
    if (this.server && this.server.connected) {
      try {
        this.server.disconnect();
      } catch (error) {
        console.warn("Error during Bluetooth disconnect:", error);
      }
    }
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
  }
}

// Printer configurations
const PRINTER_CONFIGS = {
  b1: {
    name: "B1",
    maxWidth: 384,
    maxDensity: 5,
    supportedWidths: [384],
    labelTypes: {
      1: { name: "Continuous", width: 384, minHeight: 10, maxHeight: 2000 },
      2: { name: "Gap", width: 384, minHeight: 10, maxHeight: 2000 },
      3: { name: "Perforated", width: 384, minHeight: 10, maxHeight: 2000 },
    },
  },
  b18: {
    name: "B18",
    maxWidth: 384,
    maxDensity: 3,
    supportedWidths: [384],
    labelTypes: {
      1: { name: "Continuous", width: 384, minHeight: 10, maxHeight: 2000 },
      2: { name: "Gap", width: 384, minHeight: 10, maxHeight: 2000 },
    },
  },
  b21: {
    name: "B21",
    maxWidth: 384,
    maxDensity: 5,
    supportedWidths: [384],
    labelTypes: {
      1: { name: "Continuous", width: 384, minHeight: 10, maxHeight: 4000 },
      2: { name: "Gap", width: 384, minHeight: 10, maxHeight: 4000 },
      3: { name: "Perforated", width: 384, minHeight: 10, maxHeight: 4000 },
    },
  },
  d11: {
    name: "D11",
    maxWidth: 96,
    maxDensity: 3,
    supportedWidths: [96],
    labelTypes: {
      1: { name: "Continuous", width: 96, minHeight: 10, maxHeight: 1000 },
      2: { name: "Gap", width: 96, minHeight: 10, maxHeight: 1000 },
    },
  },
  d110: {
    name: "D110",
    maxWidth: 96,
    maxDensity: 3,
    supportedWidths: [96],
    labelTypes: {
      1: { name: "Continuous", width: 96, minHeight: 10, maxHeight: 1000 },
      2: { name: "Gap", width: 96, minHeight: 10, maxHeight: 1000 },
    },
  },
  // Add more printer models as needed
  b203: {
    name: "B203",
    maxWidth: 576,
    maxDensity: 5,
    supportedWidths: [576, 384, 288],
    labelTypes: {
      1: { name: "Continuous", width: 576, minHeight: 10, maxHeight: 3000 },
      2: { name: "Gap", width: 576, minHeight: 10, maxHeight: 3000 },
      3: { name: "Round 25mm", width: 236, height: 236 },
      4: { name: "Round 32mm", width: 302, height: 302 },
    },
  },
};

// Common label sizes (in pixels at 203 DPI)
const COMMON_LABEL_SIZES = {
  // Continuous labels
  continuous_15mm: { width: 118, height: null, name: "15mm Continuous" },
  continuous_25mm: { width: 236, height: null, name: "25mm Continuous" },
  continuous_40mm: { width: 384, height: null, name: "40mm Continuous" },
  continuous_50mm: { width: 480, height: null, name: "50mm Continuous" },

  // Standard labels
  label_15x25: { width: 118, height: 197, name: "15×25mm" },
  label_25x25: { width: 236, height: 236, name: "25×25mm (Square)" },
  label_25x40: { width: 236, height: 315, name: "25×40mm" },
  label_40x30: { width: 384, height: 236, name: "40×30mm" },
  label_40x60: { width: 384, height: 472, name: "40×60mm" },
  label_50x30: { width: 480, height: 236, name: "50×30mm" },
  label_50x80: { width: 480, height: 630, name: "50×80mm" },

  // Round labels
  round_25mm: { width: 236, height: 236, name: "25mm Round", isRound: true },
  round_32mm: { width: 302, height: 302, name: "32mm Round", isRound: true },

  // Custom
  custom: { width: null, height: null, name: "Custom Size" },
};

// Printer Client
class PrinterClient {
  constructor(transport, printerModel = "b21") {
    this.transport = transport;
    this.packetBuffer = new Uint8Array();
    this.printerModel = printerModel;
    this.config = PRINTER_CONFIGS[printerModel];
    if (!this.config) {
      throw new Error(`Unsupported printer model: ${printerModel}`);
    }
  }

  getConfig() {
    return this.config;
  }

  getSupportedLabelSizes() {
    const supported = [];
    const maxWidth = this.config.maxWidth;

    for (const [key, size] of Object.entries(COMMON_LABEL_SIZES)) {
      if (size.width && size.width <= maxWidth) {
        supported.push({ key, ...size });
      } else if (!size.width) {
        // Continuous labels
        supported.push({ key, ...size, width: maxWidth });
      }
    }

    return supported;
  }

  validateDimensions(width, height) {
    const errors = [];

    if (width > this.config.maxWidth) {
      errors.push(
        `Width ${width}px exceeds maximum ${this.config.maxWidth}px for ${this.config.name}`,
      );
    }

    if (width < 10) {
      errors.push("Width must be at least 10px");
    }

    if (height && height < 10) {
      errors.push("Height must be at least 10px");
    }

    // Check if width is supported
    if (!this.config.supportedWidths.includes(width)) {
      const closest = this.config.supportedWidths.reduce((prev, curr) =>
        Math.abs(curr - width) < Math.abs(prev - width) ? curr : prev,
      );
      errors.push(
        `Width ${width}px not directly supported. Closest supported width: ${closest}px`,
      );
    }

    return errors;
  }

  async connect() {
    await this.transport.connect();
  }

  async disconnect() {
    await this.transport.disconnect();
  }

  async printImage(imageCanvas, options = {}) {
    const {
      density = 3,
      labelType = 1,
      copies = 1,
      targetWidth = null,
      targetHeight = null,
      maintainAspectRatio = true,
      centerImage = true,
    } = options;

    try {
      // Validate dimensions
      const finalWidth = targetWidth || imageCanvas.width;
      const finalHeight = targetHeight || imageCanvas.height;
      const errors = this.validateDimensions(finalWidth, finalHeight);

      if (errors.length > 0) {
        throw new Error(`Dimension validation failed: ${errors.join(", ")}`);
      }

      // Resize canvas if needed
      let printCanvas = imageCanvas;
      if (targetWidth || targetHeight) {
        printCanvas = this.resizeCanvas(imageCanvas, {
          targetWidth: finalWidth,
          targetHeight: finalHeight,
          maintainAspectRatio,
          centerImage,
        });
      }

      await this.setLabelDensity(density);
      await this.setLabelType(labelType);
      await this.startPrint();
      await this.startPagePrint();

      await this.setDimension(printCanvas.height, printCanvas.width);

      if (copies > 1) {
        await this.setQuantity(copies);
      }

      // Encode and send image data
      for await (const packet of this.encodeImage(printCanvas)) {
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

  resizeCanvas(sourceCanvas, options) {
    const {
      targetWidth,
      targetHeight,
      maintainAspectRatio = true,
      centerImage = true,
      backgroundColor = "white",
    } = options;

    const newCanvas = document.createElement("canvas");
    const ctx = newCanvas.getContext("2d");

    newCanvas.width = targetWidth || sourceCanvas.width;
    newCanvas.height = targetHeight || sourceCanvas.height;

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);

    let drawWidth = sourceCanvas.width;
    let drawHeight = sourceCanvas.height;
    let drawX = 0;
    let drawY = 0;

    if (maintainAspectRatio && targetWidth && targetHeight) {
      // Calculate scaling to fit within target dimensions
      const scaleX = targetWidth / sourceCanvas.width;
      const scaleY = targetHeight / sourceCanvas.height;
      const scale = Math.min(scaleX, scaleY);

      drawWidth = sourceCanvas.width * scale;
      drawHeight = sourceCanvas.height * scale;

      if (centerImage) {
        drawX = (targetWidth - drawWidth) / 2;
        drawY = (targetHeight - drawHeight) / 2;
      }
    } else if (targetWidth && !targetHeight) {
      // Scale to width
      const scale = targetWidth / sourceCanvas.width;
      drawWidth = targetWidth;
      drawHeight = sourceCanvas.height * scale;
      newCanvas.height = drawHeight;
    } else if (targetHeight && !targetWidth) {
      // Scale to height
      const scale = targetHeight / sourceCanvas.height;
      drawHeight = targetHeight;
      drawWidth = sourceCanvas.width * scale;
      newCanvas.width = drawWidth;
    }

    ctx.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight);
    return newCanvas;
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

  async setQuantity(quantity) {
    const data = new Uint8Array(2);
    const view = new DataView(data.buffer);
    view.setUint16(0, quantity, false);

    const packet = await this.transceive(21, data);
    return packet.data[0] !== 0;
  }
}

// Utility functions
function mmToPx(mm, dpi = 203) {
  return Math.round((mm * dpi) / 25.4);
}

function pxToMm(px, dpi = 203) {
  return Math.round((px * 25.4) / dpi);
}

// Usage example
export {
  NiimbotPacket,
  WebUSBTransport,
  WebBluetoothTransport,
  PrinterClient,
  PRINTER_CONFIGS,
  COMMON_LABEL_SIZES,
  mmToPx,
  pxToMm,
};
