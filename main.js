/**
 * Main Application Logic for NIIMBOT PNG Converter
 */

import { createNiimbotPacketFromPNG } from "./niimbot.js";

// Global variables
let selectedFile = null;
let currentPacket = null;

// DOM elements
const fileInput = document.getElementById("fileInput");
const fileName = document.getElementById("fileName");
const previewImage = document.getElementById("previewImage");
const convertButton = document.getElementById("convertButton");
const status = document.getElementById("status");
const resultSection = document.getElementById("resultSection");
const packetInfo = document.getElementById("packetInfo");
const downloadButton = document.getElementById("downloadButton");
const downloadHexButton = document.getElementById("downloadHexButton");

// Event listeners
document.addEventListener("DOMContentLoaded", initializeApp);

function initializeApp() {
  fileInput.addEventListener("change", handleFileSelect);
  convertButton.addEventListener("click", convertImage);
  downloadButton.addEventListener("click", downloadBinary);
  downloadHexButton.addEventListener("click", downloadHex);

  // Initialize upload button click handler
  const uploadButton = document.querySelector(".upload-button");
  if (uploadButton) {
    uploadButton.addEventListener("click", () => fileInput.click());
  }
}

/**
 * Handle file selection from input
 */
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file && file.type === "image/png") {
    selectedFile = file;
    fileName.textContent = `Selected: ${file.name}`;

    const reader = new FileReader();
    reader.onload = function (e) {
      previewImage.src = e.target.result;
      previewImage.classList.remove("hidden");
      convertButton.disabled = false;
    };
    reader.readAsDataURL(file);

    hideStatus();
  } else {
    showStatus("Please select a valid PNG file.", "error");
    resetFileSelection();
  }
}

/**
 * Convert the selected image to NIIMBOT packet
 */
async function convertImage() {
  if (!selectedFile) {
    showStatus("No file selected", "error");
    return;
  }

  const width = parseInt(document.getElementById("width").value);
  const height = parseInt(document.getElementById("height").value);

  if (!width || !height || width <= 0 || height <= 0) {
    showStatus("Please enter valid width and height values", "error");
    return;
  }

  try {
    showStatus("Converting image...", "success");
    convertButton.disabled = true;
    convertButton.textContent = "Converting...";

    const imageUrl = URL.createObjectURL(selectedFile);
    currentPacket = await createNiimbotPacketFromPNG(imageUrl, width, height);
    URL.revokeObjectURL(imageUrl);

    showPacketInfo(currentPacket);
    showStatus("Conversion completed successfully!", "success");
    resultSection.classList.remove("hidden");
  } catch (error) {
    showStatus(`Conversion failed: ${error.message}`, "error");
    console.error("Conversion error:", error);
    resultSection.classList.add("hidden");
  } finally {
    convertButton.disabled = false;
    convertButton.textContent = "Convert to NIIMBOT Packet";
  }
}

/**
 * Display packet information
 */
function showPacketInfo(packet) {
  const hex = Array.from(packet)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ")
    .toUpperCase();

  const payloadLength = (packet[3] << 8) | packet[4];

  packetInfo.innerHTML = `
        <strong>Packet Size:</strong> ${packet.length} bytes<br>
        <strong>Header:</strong> ${hex.substring(0, 11)} ...<br>
        <strong>Command:</strong> 0x${packet[2].toString(16).padStart(2, "0").toUpperCase()}<br>
        <strong>Payload Length:</strong> ${payloadLength} bytes<br>
        <strong>Checksum:</strong> 0x${packet[packet.length - 3].toString(16).padStart(2, "0").toUpperCase()}<br>
        <strong>Full Hex Data:</strong><br>
        <div style="font-size: 12px; max-height: 200px; overflow-y: auto; margin-top: 10px; padding: 10px; background: #f0f0f0; border-radius: 4px;">
            ${hex}
        </div>
    `;
}

/**
 * Download packet as binary file
 */
function downloadBinary() {
  if (!currentPacket) {
    showStatus("No packet to download", "error");
    return;
  }

  try {
    const blob = new Blob([currentPacket], {
      type: "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `niimbot_packet_${Date.now()}.bin`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus("Binary file downloaded successfully", "success");
  } catch (error) {
    showStatus("Failed to download binary file", "error");
    console.error("Download error:", error);
  }
}

/**
 * Download packet as hex text file
 */
function downloadHex() {
  if (!currentPacket) {
    showStatus("No packet to download", "error");
    return;
  }

  try {
    const hex = Array.from(currentPacket)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")
      .toUpperCase();

    const hexContent =
      `NIIMBOT Packet Hex Data\n` +
      `Generated: ${new Date().toISOString()}\n` +
      `Size: ${currentPacket.length} bytes\n` +
      `\n${hex}`;

    const blob = new Blob([hexContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `niimbot_packet_hex_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus("Hex file downloaded successfully", "success");
  } catch (error) {
    showStatus("Failed to download hex file", "error");
    console.error("Download error:", error);
  }
}

/**
 * Show status message
 */
function showStatus(message, type) {
  status.textContent = message;
  status.className = `status ${type}`;
  status.classList.remove("hidden");

  if (type === "success") {
    setTimeout(hideStatus, 3000);
  }
}

/**
 * Hide status message
 */
function hideStatus() {
  status.classList.add("hidden");
}

/**
 * Reset file selection
 */
function resetFileSelection() {
  selectedFile = null;
  fileName.textContent = "";
  previewImage.classList.add("hidden");
  previewImage.src = "";
  convertButton.disabled = true;
  resultSection.classList.add("hidden");
  currentPacket = null;
}
