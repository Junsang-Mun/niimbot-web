/**
 * Main Application Logic for NIIMBOT Label Designer
 */

import { createNiimbotPacketFromPNG } from "./niimbot.js";
import { showStatus } from "./canvas.js";

// Global variables
let currentPacket = null;

// DOM elements
document.addEventListener("DOMContentLoaded", initializeApp);

function initializeApp() {
  // Set up download button listeners
  document.getElementById("downloadButton").addEventListener("click", downloadBinary);
  document.getElementById("downloadHexButton").addEventListener("click", downloadHex);
  
  // Initialize print size presets
  initializePrintSizePresets();
}

/**
 * Initialize print size presets based on common Niimbot label sizes
 */
function initializePrintSizePresets() {
  const printerModelSelect = document.getElementById("printerModel");
  
  printerModelSelect.addEventListener("change", function() {
    const model = this.value;
    const widthInput = document.getElementById("labelWidth");
    const heightInput = document.getElementById("labelHeight");
    
    // Set recommended default sizes based on model
    switch(model) {
      case "B21":
        // Common B21 sizes
        suggestSize(40, 20); // 40mm x 20mm label
        break;
      case "B1":
        // Common B1 sizes
        suggestSize(50, 30); // 50mm x 30mm label
        break;
      case "B18":
        // Common B18 sizes
        suggestSize(40, 15); // 40mm x 15mm label
        break;
      default:
        // Default size
        suggestSize(48, 30);
    }
  });
  
  /**
   * Suggest a label size without forcing it
   */
  function suggestSize(width, height) {
    const widthInput = document.getElementById("labelWidth");
    const heightInput = document.getElementById("labelHeight");
    
    // Only suggest if the user hasn't explicitly set something different
    if (!document.activeElement || 
        (document.activeElement !== widthInput && 
         document.activeElement !== heightInput)) {
      
      const currentWidth = parseInt(widthInput.value, 10);
      const currentHeight = parseInt(heightInput.value, 10);
      
      // Check if current values are very different from suggested ones
      const widthDiff = Math.abs(currentWidth - width);
      const heightDiff = Math.abs(currentHeight - height);
      
      if (widthDiff > 10 || heightDiff > 10) {
        if (confirm(`Would you like to use the recommended size for this printer model: ${width}mm × ${height}mm?`)) {
          widthInput.value = width;
          heightInput.value = height;
          
          // Trigger change event to update canvas
          const event = new Event('change');
          widthInput.dispatchEvent(event);
        }
      }
    }
  }
}

/**
 * Set current packet from canvas conversion
 */
export function setCurrentPacket(packet) {
  currentPacket = packet;
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
    a.download = `niimbot_label_${Date.now()}.bin`;
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
    a.download = `niimbot_label_hex_${Date.now()}.txt`;
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