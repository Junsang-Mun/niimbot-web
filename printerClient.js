import NiimbotPacket from "./niimbotPacket.js";

// 정보 항목
export const InfoEnum = Object.freeze({
  DENSITY: 1,
  PRINTSPEED: 2,
  LABELTYPE: 3,
  LANGUAGETYPE: 6,
  AUTOSHUTDOWNTIME: 7,
  DEVICETYPE: 8,
  SOFTVERSION: 9,
  BATTERY: 10,
  DEVICESERIAL: 11,
  HARDVERSION: 12,
});

// 요청 코드
export const RequestCodeEnum = Object.freeze({
  GET_INFO: 64,
  GET_RFID: 26,
  HEARTBEAT: 220,
  SET_LABEL_TYPE: 35,
  SET_LABEL_DENSITY: 33,
  START_PRINT: 1,
  END_PRINT: 243,
  START_PAGE_PRINT: 3,
  END_PAGE_PRINT: 227,
  ALLOW_PRINT_CLEAR: 32,
  SET_DIMENSION: 19,
  SET_QUANTITY: 21,
  GET_PRINT_STATUS: 163,
});

export default class PrinterClientWeb {
  constructor() {
    this.usbDevice = null;
    this.bleDevice = null;
    this.usbEndpointOut = null;
    this.usbEndpointIn = null;
    this.bleCharacteristic = null;
    this._buffer = new Uint8Array();
  }

  // ---------------- USB ----------------
  async connectUSB(vendorId, productId) {
    this.usbDevice = await navigator.usb.requestDevice({
      filters: [{ vendorId, productId }],
    });
    await this.usbDevice.open();
    if (!this.usbDevice.configuration)
      await this.usbDevice.selectConfiguration(1);

    // 실제 데이터 전송용 인터페이스 번호를 찾는다
    let ifaceNum = null;
    for (const iface of this.usbDevice.configuration.interfaces) {
      for (const alt of iface.alternate.endpoints) {
        if (alt.type === "bulk") {
          ifaceNum = iface.interfaceNumber;
          // out/in 엔드포인트 번호도 같이 저장
          if (alt.direction === "out") this.usbEndpointOut = alt.endpointNumber;
          if (alt.direction === "in") this.usbEndpointIn = alt.endpointNumber;
        }
      }
      if (ifaceNum !== null) break;
    }
    if (ifaceNum === null)
      throw new Error("Bulk 인터페이스를 찾을 수 없습니다.");

    // 찾은 번호로 claim
    await this.usbDevice.claimInterface(ifaceNum);
  }

  async _usbTransferOut(data) {
    await this.usbDevice.transferOut(this.usbEndpointOut, data);
  }

  async _usbTransferIn(length = 64) {
    const result = await this.usbDevice.transferIn(this.usbEndpointIn, length);
    return new Uint8Array(result.data.buffer);
  }

  // ---------------- BLE ----------------
  async connectBLE(serviceUuid, characteristicUuid) {
    this.bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ services: [serviceUuid] }],
    });
    const server = await this.bleDevice.gatt.connect();
    const service = await server.getPrimaryService(serviceUuid);
    this.bleCharacteristic =
      await service.getCharacteristic(characteristicUuid);
    await this.bleCharacteristic.startNotifications();
    this.bleCharacteristic.addEventListener(
      "characteristicvaluechanged",
      (ev) => {
        const chunk = new Uint8Array(ev.target.value.buffer);
        this._buffer = this._concat(this._buffer, chunk);
      },
    );
  }

  async _bleWrite(data) {
    await this.bleCharacteristic.writeValue(data);
  }

  // ---------------- Shared ----------------
  _concat(a, b) {
    const c = new Uint8Array(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
  }

  async sendPacket(packet, via = "usb") {
    const data = packet.toBytes();
    if (via === "usb") await this._usbTransferOut(data);
    else await this._bleWrite(data);
  }

  async receivePackets(via = "usb") {
    if (via === "usb") {
      const chunk = await this._usbTransferIn();
      this._buffer = this._concat(this._buffer, chunk);
    }
    const packets = [];
    while (this._buffer.length > 4) {
      const len = this._buffer[3] + 7;
      if (this._buffer.length < len) break;
      const slice = this._buffer.slice(0, len);
      packets.push(NiimbotPacket.fromBytes(slice));
      this._buffer = this._buffer.slice(len);
    }
    return packets;
  }

  async transceive(reqCode, dataBytes, via = "usb", respOffset = 1) {
    const expectedType = reqCode + respOffset;
    const pkt = new NiimbotPacket(reqCode, Uint8Array.from(dataBytes));
    await this.sendPacket(pkt, via);
    for (let i = 0; i < 6; i++) {
      const pkts = await this.receivePackets(via);
      for (const p of pkts) {
        if (p.type === expectedType) return p;
        if (p.type === 219) throw new Error("Error packet");
      }
      await new Promise((res) => setTimeout(res, 100));
    }
    return null;
  }

  // ---------------- High-level API ----------------
  async getInfo(key, via = "usb") {
    const resp = await this.transceive(
      RequestCodeEnum.GET_INFO,
      [key],
      via,
      key,
    );
    if (!resp) return null;
    const data = resp.data;
    if (key === InfoEnum.DEVICESERIAL) {
      return Array.from(data)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    let value = 0;
    for (const b of data) value = (value << 8) | b;
    if (key === InfoEnum.SOFTVERSION || key === InfoEnum.HARDVERSION)
      return value / 100;
    return value;
  }

  async getRfid(via = "usb") {
    const resp = await this.transceive(RequestCodeEnum.GET_RFID, [1], via);
    if (!resp) return null;
    const d = resp.data;
    if (d[0] === 0) return null;
    const uuid = Array.from(d.slice(0, 8))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    let idx = 8;
    const blen = d[idx++];
    const barcode = new TextDecoder().decode(d.slice(idx, idx + blen));
    idx += blen;
    const slen = d[idx++];
    const serial = new TextDecoder().decode(d.slice(idx, idx + slen));
    idx += slen;
    const total_len = (d[idx] << 8) | d[idx + 1];
    const used_len = (d[idx + 2] << 8) | d[idx + 3];
    const type = d[idx + 4];
    return { uuid, barcode, serial, total_len, used_len, type };
  }

  async heartbeat(via = "usb") {
    const resp = await this.transceive(RequestCodeEnum.HEARTBEAT, [1], via);
    const d = resp?.data || [];
    let closingstate, powerlevel, paperstate, rfidreadstate;
    switch (d.length) {
      case 20:
        paperstate = d[18];
        rfidreadstate = d[19];
        break;
      case 13:
        closingstate = d[9];
        powerlevel = d[10];
        paperstate = d[11];
        rfidreadstate = d[12];
        break;
      case 19:
        closingstate = d[15];
        powerlevel = d[16];
        paperstate = d[17];
        rfidreadstate = d[18];
        break;
      case 10:
        closingstate = d[8];
        powerlevel = d[9];
        paperstate = undefined;
        rfidreadstate = d[8];
        break;
      case 9:
        closingstate = d[8];
        break;
    }
    return { closingstate, powerlevel, paperstate, rfidreadstate };
  }

  async setLabelType(n, via = "usb") {
    if (n < 1 || n > 3) throw new RangeError("n must be 1-3");
    const resp = await this.transceive(
      RequestCodeEnum.SET_LABEL_TYPE,
      [n],
      via,
      16,
    );
    return Boolean(resp?.data[0]);
  }

  async setLabelDensity(n, via = "usb") {
    if (n < 1 || n > 3) throw new RangeError("n must be 1-3");
    const resp = await this.transceive(
      RequestCodeEnum.SET_LABEL_DENSITY,
      [n],
      via,
      16,
    );
    return Boolean(resp?.data[0]);
  }

  async startPrint(via = "usb") {
    const resp = await this.transceive(RequestCodeEnum.START_PRINT, [1], via);
    return Boolean(resp?.data[0]);
  }

  async endPrint(via = "usb") {
    const resp = await this.transceive(RequestCodeEnum.END_PRINT, [1], via);
    return Boolean(resp?.data[0]);
  }

  async startPagePrint(via = "usb") {
    const resp = await this.transceive(
      RequestCodeEnum.START_PAGE_PRINT,
      [1],
      via,
    );
    return Boolean(resp?.data[0]);
  }

  async endPagePrint(via = "usb") {
    const resp = await this.transceive(
      RequestCodeEnum.END_PAGE_PRINT,
      [1],
      via,
    );
    return Boolean(resp?.data[0]);
  }

  async allowPrintClear(via = "usb") {
    const resp = await this.transceive(
      RequestCodeEnum.ALLOW_PRINT_CLEAR,
      [1],
      via,
      16,
    );
    return Boolean(resp?.data[0]);
  }

  async setDimension(w, h, via = "usb") {
    const data = [(w >> 8) & 0xff, w & 0xff, (h >> 8) & 0xff, h & 0xff];
    const resp = await this.transceive(
      RequestCodeEnum.SET_DIMENSION,
      data,
      via,
    );
    return Boolean(resp?.data[0]);
  }

  async setQuantity(n, via = "usb") {
    const data = [(n >> 8) & 0xff, n & 0xff];
    const resp = await this.transceive(RequestCodeEnum.SET_QUANTITY, data, via);
    return Boolean(resp?.data[0]);
  }

  async getPrintStatus(via = "usb") {
    const resp = await this.transceive(
      RequestCodeEnum.GET_PRINT_STATUS,
      [1],
      via,
      16,
    );
    const d = resp?.data || [];
    const page = (d[0] << 8) | d[1];
    const progress1 = d[2];
    const progress2 = d[3];
    return { page, progress1, progress2 };
  }
}
