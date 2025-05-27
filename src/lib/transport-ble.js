// lib/transport-ble.js

/**
 * WebBLETransport: communicates with Niimbot B1 over Bluetooth LE using the Web Bluetooth API
 */
export class WebBLETransport {
  /**
   * @param {BluetoothRemoteGATTCharacteristic} characteristic - BLE characteristic for data transfer
   */
  constructor(characteristic) {
    this.characteristic = characteristic;
  }

  /**
   * Request and connect to a Niimbot BLE device
   * @returns {Promise<WebBLETransport>} connected transport
   */
  static async requestDevice() {
    // Prompt user to select a Niimbot BLE printer advertise name or service
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        // adjust namePrefix or service UUID based on actual device
        { namePrefix: "B1" },
      ],
      optionalServices: [0xffe0],
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(0xffe0);
    // Characteristic UUID may vary; FFE1 is common for SPP-like transfer
    const characteristic = await service.getCharacteristic(0xffe1);
    return new WebBLETransport(characteristic);
  }

  /**
   * Send data to the printer over BLE
   * @param {Uint8Array} data - packet bytes
   */
  async write(data) {
    // BLE typically limits to ~20 bytes per write; chunk if necessary
    const MTU = 20;
    for (let i = 0; i < data.length; i += MTU) {
      const chunk = data.slice(i, i + MTU);
      await this.characteristic.writeValue(chunk);
    }
  }

  /**
   * Close the BLE connection
   */
  async close() {
    const server = this.characteristic.service.device.gatt;
    if (server.connected) {
      await server.disconnect();
    }
  }
}
