// lib/transport-usb.js

/**
 * WebUSBTransport: communicates with Niimbot B1 over USB using the WebUSB API
 */
export class WebUSBTransport {
  /**
   * @param {USBDevice} device - The USBDevice instance from navigator.usb
   */
  constructor(device) {
    this.device = device;
    this.interfaceNumber = null;
    this.endpointOut = null;
    this.endpointIn = null;
  }

  /**
   * Request and open a Niimbot USB device
   * @returns {Promise<WebUSBTransport>} connected transport
   */
  static async requestDevice() {
    // Prompt user to select a Niimbot printer (vendorId may vary)
    const device = await navigator.usb.requestDevice();
    const transport = new WebUSBTransport(device);
    await transport.connect();
    return transport;
  }

  /**
   * Opens and claims the correct interface and endpoints
   */
  async connect() {
    await this.device.open();
    if (this.device.configuration === null) {
      await this.device.selectConfiguration(1);
    }
    // Find interface with both in and out endpoints
    const config = this.device.configuration;
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        const outEp = alt.endpoints.find((e) => e.direction === "out");
        const inEp = alt.endpoints.find((e) => e.direction === "in");
        if (outEp && inEp) {
          this.interfaceNumber = iface.interfaceNumber;
          this.endpointOut = outEp.endpointNumber;
          this.endpointIn = inEp.endpointNumber;
          break;
        }
      }
      if (this.interfaceNumber !== null) break;
    }
    if (this.interfaceNumber === null) {
      throw new Error("Suitable interface not found on USB device");
    }
    await this.device.claimInterface(this.interfaceNumber);
  }

  /**
   * Send data to the printer
   * @param {Uint8Array} data - packet bytes
   */
  async write(data) {
    await this.device.transferOut(this.endpointOut, data);
  }

  /**
   * Read data from the printer
   * @param {number} length - number of bytes to read
   * @returns {Promise<Uint8Array>}
   */
  async read(length = 64) {
    const result = await this.device.transferIn(this.endpointIn, length);
    return new Uint8Array(result.data.buffer);
  }

  /**
   * Close the connection
   */
  async close() {
    if (this.device.opened) {
      await this.device.releaseInterface(this.interfaceNumber);
      await this.device.close();
    }
  }
}
