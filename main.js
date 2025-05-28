import PrinterClientWeb, {
  InfoEnum,
  RequestCodeEnum,
} from "./printerClient.js";

const btnConnectUSB = document.getElementById("btnConnectUSB");
const btnConnectBLE = document.getElementById("btnConnectBLE");
const btnGetInfo = document.getElementById("btnGetInfo");
const btnStartPrint = document.getElementById("btnStartPrint");
const btnEndPrint = document.getElementById("btnEndPrint");
const logArea = document.getElementById("log");

const client = new PrinterClientWeb();

function log(msg) {
  const line = document.createElement("div");
  line.textContent = msg;
  logArea.appendChild(line);
}

async function handleConnectUSB() {
  try {
    await client.connectUSB(/*vendorId=*/ 0x3513, /*productId=*/ 0x0002);
    log("USB 연결 성공");
  } catch (err) {
    log("USB 연결 실패: " + err);
  }
}

async function handleConnectBLE() {
  try {
    await client.connectBLE("printer-service-uuid", "printer-char-uuid");
    log("BLE 연결 성공");
  } catch (err) {
    log("BLE 연결 실패: " + err);
  }
}

async function handleGetInfo() {
  try {
    const density = await client.getInfo(InfoEnum.DENSITY, "usb");
    log("현재 밀도: " + density);
  } catch (err) {
    log("정보 조회 오류: " + err);
  }
}

async function handleStartPrint() {
  try {
    await client.setLabelType(1, "usb"); // 라벨 타입 설정
    await client.setLabelDensity(2, "usb"); // 밀도 설정
    const started = await client.startPrint("usb");
    log("인쇄 시작: " + (started ? "성공" : "실패"));
  } catch (err) {
    log("인쇄 시작 오류: " + err);
  }
}

async function handleEndPrint() {
  try {
    const ended = await client.endPrint("usb");
    log("인쇄 종료: " + (ended ? "성공" : "실패"));
  } catch (err) {
    log("인쇄 종료 오류: " + err);
  }
}

btnConnectUSB.addEventListener("click", handleConnectUSB);
btnConnectBLE.addEventListener("click", handleConnectBLE);
btnGetInfo.addEventListener("click", handleGetInfo);
btnStartPrint.addEventListener("click", handleStartPrint);
btnEndPrint.addEventListener("click", handleEndPrint);

window.addEventListener("DOMContentLoaded", () => {
  log("메인 스크립트 로드 완료");
});
