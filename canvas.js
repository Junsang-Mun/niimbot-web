/**
 * NIIMBOT Interactive Canvas Editor
 * This file handles the interactive canvas for label design
 */

import { createNiimbotPacketFromPNG } from "./niimbot.js";

// Initialize variables
let canvas;
const pixelsPerMM = 8; // 8 pixels per mm (203 dpi)
let currentMode = "draw"; // Current tool mode: draw, erase, text, etc.

// Settings variables
const defaultWidth = 48; // 48mm
const defaultHeight = 30; // 30mm
const maxWidth = {
  B21: 384,
  B1: 384,
  B18: 384
};

// DOM elements
document.addEventListener("DOMContentLoaded", initializeCanvas);

/**
 * Initialize the canvas and all event listeners
 */
function initializeCanvas() {
  // Initialize Fabric.js canvas
  canvas = new fabric.Canvas("labelCanvas", {
    isDrawingMode: true,
    backgroundColor: "white"
  });

  // Get DOM elements
  const labelWidthInput = document.getElementById("labelWidth");
  const labelHeightInput = document.getElementById("labelHeight");
  const printerModelSelect = document.getElementById("printerModel");
  
  // Set initial canvas size based on default label size
  updateCanvasSize();
  
  // Tool buttons
  const drawToolBtn = document.getElementById("drawTool");
  const eraseToolBtn = document.getElementById("eraseTool");
  const addTextBtn = document.getElementById("addText");
  const uploadImageBtn = document.getElementById("uploadImageBtn");
  const uploadImageInput = document.getElementById("uploadImage");
  const clearCanvasBtn = document.getElementById("clearCanvas");
  const deleteSelectedBtn = document.getElementById("deleteSelected");
  const bringToFrontBtn = document.getElementById("bringToFront");
  const sendToBackBtn = document.getElementById("sendToBack");
  
  // Drawing controls
  const brushColorInput = document.getElementById("brushColor");
  const brushSizeInput = document.getElementById("brushSize");
  const fontFamilySelect = document.getElementById("fontFamily");
  const fontSizeSelect = document.getElementById("fontSize");

  // Preview and conversion buttons
  const previewButton = document.getElementById("previewButton");
  const convertButton = document.getElementById("convertButton");
  
  // Modal elements
  const previewModal = document.getElementById("previewModal");
  const closeModalBtn = document.querySelector(".close-modal");
  const previewImage = document.getElementById("previewImage");
  const dimensionsInfo = document.getElementById("dimensionsInfo");

  // Configure brush
  canvas.freeDrawingBrush.width = parseInt(brushSizeInput.value, 10);
  canvas.freeDrawingBrush.color = brushColorInput.value;

  // Event listeners for settings
  labelWidthInput.addEventListener("change", updateCanvasSize);
  labelHeightInput.addEventListener("change", updateCanvasSize);
  printerModelSelect.addEventListener("change", validateDimensions);
  
  // Tool event listeners
  drawToolBtn.addEventListener("click", () => setMode("draw"));
  eraseToolBtn.addEventListener("click", () => setMode("erase"));
  addTextBtn.addEventListener("click", addNewText);
  uploadImageBtn.addEventListener("click", () => uploadImageInput.click());
  uploadImageInput.addEventListener("change", handleImageUpload);
  clearCanvasBtn.addEventListener("click", clearCanvas);
  deleteSelectedBtn.addEventListener("click", deleteSelectedObject);
  bringToFrontBtn.addEventListener("click", bringToFront);
  sendToBackBtn.addEventListener("click", sendToBack);

  // Drawing control event listeners
  brushColorInput.addEventListener("input", updateBrushColor);
  brushSizeInput.addEventListener("input", updateBrushSize);
  
  // Preview and conversion listeners
  previewButton.addEventListener("click", showPreview);
  convertButton.addEventListener("click", convertToNiimbotPacket);
  
  // Modal listeners
  closeModalBtn.addEventListener("click", () => previewModal.classList.add("hidden"));
  window.addEventListener("click", (e) => {
    if (e.target === previewModal) {
      previewModal.classList.add("hidden");
    }
  });

  // Initialize canvas selection capabilities
  canvas.on("selection:created", updateUIForSelection);
  canvas.on("selection:updated", updateUIForSelection);
  canvas.on("selection:cleared", updateUIForNoSelection);

  // Set up text controls
  fontFamilySelect.addEventListener("change", updateTextStyles);
  fontSizeSelect.addEventListener("change", updateTextStyles);
  
  // Load locally installed fonts (using fontdetect.js)
  loadLocalFonts();
}

/**
 * Update canvas size based on label dimensions
 */
function updateCanvasSize() {
  const labelWidthInput = document.getElementById("labelWidth");
  const labelHeightInput = document.getElementById("labelHeight");
  const widthMM = parseInt(labelWidthInput.value, 10) || defaultWidth;
  const heightMM = parseInt(labelHeightInput.value, 10) || defaultHeight;
  
  // Validate dimensions
  validateDimensions();
  
  // Set canvas size in pixels
  const widthPx = widthMM * pixelsPerMM;
  const heightPx = heightMM * pixelsPerMM;
  
  canvas.setWidth(widthPx);
  canvas.setHeight(heightPx);
  canvas.renderAll();
}

/**
 * Validate dimensions based on printer model
 */
function validateDimensions() {
  const labelWidthInput = document.getElementById("labelWidth");
  const printerModelSelect = document.getElementById("printerModel");
  const model = printerModelSelect.value;
  
  const currentWidthMM = parseInt(labelWidthInput.value, 10);
  const maxWidthMM = Math.floor(maxWidth[model] / pixelsPerMM);
  
  if (currentWidthMM > maxWidthMM) {
    labelWidthInput.value = maxWidthMM;
    showStatus(`Maximum width for ${model} is ${maxWidthMM}mm`, "warning");
    updateCanvasSize();
  }
}

/**
 * Set the current tool mode
 */
function setMode(mode) {
  currentMode = mode;
  
  // Reset all tool buttons
  document.querySelectorAll(".tool-button").forEach(btn => {
    btn.classList.remove("active");
  });
  
  // Update canvas drawing mode
  if (mode === "draw") {
    document.getElementById("drawTool").classList.add("active");
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush.color = document.getElementById("brushColor").value;
  } else if (mode === "erase") {
    document.getElementById("eraseTool").classList.add("active");
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush.color = "white"; // Set brush to white for "erasing"
  } else {
    canvas.isDrawingMode = false;
  }
}

/**
 * Update brush color
 */
function updateBrushColor() {
  const color = document.getElementById("brushColor").value;
  canvas.freeDrawingBrush.color = color;
  
  // Only update if we're in draw mode (not erase mode)
  if (currentMode === "draw") {
    canvas.freeDrawingBrush.color = color;
  }
}

/**
 * Update brush size
 */
function updateBrushSize() {
  const size = parseInt(document.getElementById("brushSize").value, 10);
  canvas.freeDrawingBrush.width = size;
}

/**
 * Add new text to the canvas
 */
function addNewText() {
  const text = new fabric.IText("Edit this text", {
    left: 50,
    top: 50,
    fontFamily: document.getElementById("fontFamily").value,
    fontSize: parseInt(document.getElementById("fontSize").value, 10),
    fill: document.getElementById("brushColor").value
  });
  
  canvas.add(text);
  canvas.setActiveObject(text);
  text.enterEditing();
  
  // Switch to selection mode
  setMode("select");
}

/**
 * Update text styles for selected text objects
 */
function updateTextStyles() {
  const fontFamily = document.getElementById("fontFamily").value;
  const fontSize = parseInt(document.getElementById("fontSize").value, 10);
  const color = document.getElementById("brushColor").value;
  
  const activeObject = canvas.getActiveObject();
  if (activeObject && activeObject.type === 'i-text') {
    activeObject.set({
      fontFamily: fontFamily,
      fontSize: fontSize,
      fill: color
    });
    canvas.renderAll();
  }
}

/**
 * Handle image upload
 */
function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(event) {
    const imgObj = new Image();
    imgObj.src = event.target.result;
    imgObj.onload = function() {
      const image = new fabric.Image(imgObj);
      
      // Scale image to fit within canvas
      const canvasWidth = canvas.getWidth();
      const canvasHeight = canvas.getHeight();
      const scale = Math.min(
        (canvasWidth * 0.8) / image.width, 
        (canvasHeight * 0.8) / image.height
      );
      
      image.set({
        scaleX: scale,
        scaleY: scale,
        left: 20,
        top: 20
      });
      
      canvas.add(image);
      canvas.setActiveObject(image);
      canvas.renderAll();
      
      // Reset file input
      e.target.value = "";
      
      // Switch to selection mode
      setMode("select");
    };
  };
  reader.readAsDataURL(file);
}

/**
 * Clear the canvas
 */
function clearCanvas() {
  if (confirm("Are you sure you want to clear the entire canvas?")) {
    canvas.clear();
    canvas.setBackgroundColor("white", canvas.renderAll.bind(canvas));
  }
}

/**
 * Delete the selected object
 */
function deleteSelectedObject() {
  const activeObject = canvas.getActiveObject();
  if (activeObject) {
    if (activeObject.type === 'activeSelection') {
      // Multiple objects selected
      activeObject.getObjects().forEach(obj => {
        canvas.remove(obj);
      });
      canvas.discardActiveObject();
    } else {
      // Single object
      canvas.remove(activeObject);
    }
    canvas.renderAll();
  }
}

/**
 * Bring selected object to front
 */
function bringToFront() {
  const activeObject = canvas.getActiveObject();
  if (activeObject) {
    canvas.bringToFront(activeObject);
    canvas.renderAll();
  }
}

/**
 * Send selected object to back
 */
function sendToBack() {
  const activeObject = canvas.getActiveObject();
  if (activeObject) {
    canvas.sendToBack(activeObject);
    canvas.renderAll();
  }
}

/**
 * Update UI when object is selected
 */
function updateUIForSelection() {
  document.getElementById("deleteSelected").disabled = false;
  document.getElementById("bringToFront").disabled = false;
  document.getElementById("sendToBack").disabled = false;
  
  const activeObject = canvas.getActiveObject();
  if (activeObject && activeObject.type === 'i-text') {
    // Update text controls to reflect selected text
    document.getElementById("fontFamily").value = activeObject.fontFamily;
    document.getElementById("fontSize").value = activeObject.fontSize;
    document.getElementById("brushColor").value = activeObject.fill;
  }
}

/**
 * Update UI when no object is selected
 */
function updateUIForNoSelection() {
  document.getElementById("deleteSelected").disabled = true;
  document.getElementById("bringToFront").disabled = true;
  document.getElementById("sendToBack").disabled = true;
}

/**
 * Show print preview in modal
 */
function showPreview() {
  // Get the canvas as an image
  const dataURL = canvas.toDataURL({
    format: 'png',
    quality: 1
  });
  
  // Get dimensions
  const widthMM = parseInt(document.getElementById("labelWidth").value, 10);
  const heightMM = parseInt(document.getElementById("labelHeight").value, 10);
  const widthPx = widthMM * pixelsPerMM;
  const heightPx = heightMM * pixelsPerMM;
  
  // Update preview image
  const previewImage = document.getElementById("previewImage");
  previewImage.src = dataURL;
  
  // Set physical size in preview to match real-world dimensions
  previewImage.style.width = `${widthMM}mm`;
  previewImage.style.height = `${heightMM}mm`;
  
  // Update dimensions info
  document.getElementById("dimensionsInfo").textContent = 
    `${widthMM}mm × ${heightMM}mm (${widthPx}px × ${heightPx}px)`;
  
  // Show the modal
  document.getElementById("previewModal").classList.remove("hidden");
}

/**
 * Convert canvas to Niimbot packet
 */
async function convertToNiimbotPacket() {
  try {
    // Get canvas dimensions
    const width = canvas.getWidth();
    const height = canvas.getHeight();
    
    // Get the image data URL
    const dataURL = canvas.toDataURL({
      format: 'png',
      quality: 1
    });
    
    // Display status
    showStatus("Converting design to NIIMBOT packet...", "success");
    
    // Convert to packet
    const packet = await createNiimbotPacketFromPNG(dataURL, width, height);
    
    // Show result section and packet info
    displayConversionResult(packet);
    
  } catch (error) {
    showStatus(`Conversion error: ${error.message}`, "error");
    console.error("Conversion error:", error);
  }
}

/**
 * Display conversion result
 */
function displayConversionResult(packet) {
  const resultSection = document.getElementById("resultSection");
  const packetInfo = document.getElementById("packetInfo");
  
  // Show result section
  resultSection.classList.remove("hidden");
  
  // Display packet information
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
  
  // Set up download buttons
  document.getElementById("downloadButton").addEventListener("click", () => {
    downloadBinaryPacket(packet);
  });
  
  document.getElementById("downloadHexButton").addEventListener("click", () => {
    downloadHexPacket(packet);
  });
}

/**
 * Download binary packet
 */
function downloadBinaryPacket(packet) {
  try {
    const blob = new Blob([packet], {
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
function downloadHexPacket(packet) {
  try {
    const hex = Array.from(packet)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")
      .toUpperCase();

    const hexContent =
      `NIIMBOT Packet Hex Data\n` +
      `Generated: ${new Date().toISOString()}\n` +
      `Size: ${packet.length} bytes\n` +
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

/**
 * Attempt to load locally installed fonts
 */
function loadLocalFonts() {
  if (window.FontDetect) {
    const fontSelect = document.getElementById("fontFamily");
    const commonFonts = [
      "Arial", "Helvetica", "Times New Roman", "Courier New", 
      "Georgia", "Verdana", "Impact", "Tahoma", "Trebuchet MS",
      "Comic Sans MS", "Segoe UI", "Calibri", "Cambria", "Garamond"
    ];
    
    // Clear current options
    fontSelect.innerHTML = '';
    
    // Add detected fonts
    commonFonts.forEach(font => {
      if (FontDetect.isFontAvailable(font)) {
        const option = document.createElement("option");
        option.value = font;
        option.textContent = font;
        option.style.fontFamily = font;
        fontSelect.appendChild(option);
      }
    });
    
    // If no fonts were detected, add defaults
    if (fontSelect.options.length === 0) {
      const defaultFonts = ["Arial", "Helvetica", "Times New Roman", "Courier New"];
      defaultFonts.forEach(font => {
        const option = document.createElement("option");
        option.value = font;
        option.textContent = font;
        option.style.fontFamily = font;
        fontSelect.appendChild(option);
      });
    }
  }
}

/**
 * Show status message
 */
function showStatus(message, type = "success") {
  const status = document.getElementById("status");
  status.textContent = message;
  status.className = `status ${type}`;
  status.classList.remove("hidden");

  if (type === "success") {
    setTimeout(() => {
      status.classList.add("hidden");
    }, 3000);
  }
}

// Export functions that may be needed by main.js
export { showStatus };