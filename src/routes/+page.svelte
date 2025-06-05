<script>
    import { onMount, onDestroy } from "svelte";
    import {
        WebUSBTransport,
        WebBluetoothTransport,
        PrinterClient,
    } from "$lib/printerController.js";
    import * as fabric from "fabric";

    // Printer connection state
    let connectionType = "usb";
    let printerClient = null;
    let isConnected = false;
    let isConnecting = false;
    let isPrinting = false;
    let status = "Disconnected";
    let printerModel = "b21";
    let density = 3;

    // Canvas state
    let fabricCanvas;
    let canvasContainer;
    let canvasWidthMM = 40; // Default width in mm
    let canvasHeightMM = 20; // Default height in mm
    const MAX_LABEL_WIDTH_MM = 50; // Max width as requested
    const DPI = 203; // Standard DPI for thermal printers

    // Text properties
    // Text and object properties
    let fontSize = 20;
    let fontFamily = "Arial";
    let textColor = "#000000";
    let selectedObject = null;
    let drawingMode = false;
    let penSize = 2;
    let penColor = "#000000";
    let systemFonts = [
        "Arial",
        "Helvetica",
        "Times New Roman",
        "Times",
        "Courier New",
        "Courier",
        "Verdana",
        "Georgia",
        "Palatino",
        "Garamond",
        "Bookman",
        "Comic Sans MS",
        "Trebuchet MS",
        "Impact",
        "Tahoma",
        "Lucida Sans",
        "Lucida Console",
    ];
    let fontAccessSupported = false;
    let fontAccessGranted = false;
    let fontListLoading = false;
    let currentFontPreview = fontFamily;
    let fontError = null;

    // Update drawing brush when properties change
    $: if (
        fabricCanvas &&
        fabricCanvas.isDrawingMode &&
        fabricCanvas.freeDrawingBrush
    ) {
        fabricCanvas.freeDrawingBrush.width = penSize;
        fabricCanvas.freeDrawingBrush.color = penColor;
        fabricCanvas.freeDrawingBrush.strokeLineCap = "round";
        fabricCanvas.freeDrawingBrush.strokeLineJoin = "round";
        fabricCanvas.renderAll();
    }
    
    // Update component state when selection changes
    $: if (selectedObject) {
        if (selectedObject.type === 'i-text' || selectedObject.type === 'text') {
            fontFamily = selectedObject.fontFamily;
            fontSize = selectedObject.fontSize;
            textColor = selectedObject.fill;
            currentFontPreview = selectedObject.fontFamily;
        }
    }

    // Update current font preview when fontFamily changes
    $: currentFontPreview = fontFamily;

    // Printer model configurations
    const printerConfigs = {
        b1: {
            name: "B1",
            maxWidth: 384,
            maxDensity: 5,
            supportedWidths: [384],
            maxWidthMM: 48,
        },
        b18: {
            name: "B18",
            maxWidth: 384,
            maxDensity: 3,
            supportedWidths: [384],
            maxWidthMM: 48,
        },
        b21: {
            name: "B21",
            maxWidth: 384,
            maxDensity: 5,
            supportedWidths: [384],
            maxWidthMM: 48,
        },
        d11: {
            name: "D11",
            maxWidth: 96,
            maxDensity: 3,
            supportedWidths: [96],
            maxWidthMM: 12,
        },
        d110: {
            name: "D110",
            maxWidth: 96,
            maxDensity: 3,
            supportedWidths: [96],
            maxWidthMM: 12,
        },
        b203: {
            name: "B203",
            maxWidth: 576,
            maxDensity: 5,
            supportedWidths: [576, 384, 288],
            maxWidthMM: 72,
        },
    };

    $: currentConfig = printerConfigs[printerModel];
    $: maxDensity = currentConfig?.maxDensity || 5;
    $: if (currentConfig && canvasWidthMM > currentConfig.maxWidthMM) {
        canvasWidthMM = currentConfig.maxWidthMM;
        updateCanvasSize();
    }

    // Convert mm to px
    function mmToPx(mm) {
        return Math.round((mm * DPI) / 25.4);
    }

    // Convert px to mm
    function pxToMm(px) {
        return Math.round((px / DPI) * 25.4 * 10) / 10;
    }

    onMount(() => {
        // Initialize Fabric.js canvas
        fabricCanvas = new fabric.Canvas("design-canvas", {
            backgroundColor: "white",
            width: mmToPx(canvasWidthMM),
            height: mmToPx(canvasHeightMM),
            preserveObjectStacking: true,
            selection: true,
            isDrawingMode: false,
        });

        // Initialize drawing brush - explicitly create the brush to ensure it exists
        if (fabric.PencilBrush) {
            fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(
                fabricCanvas,
            );
            fabricCanvas.freeDrawingBrush.width = penSize;
            fabricCanvas.freeDrawingBrush.color = penColor;
            fabricCanvas.freeDrawingBrush.strokeLineCap = "round";
            fabricCanvas.freeDrawingBrush.strokeLineJoin = "round";
        } else {
            console.error("PencilBrush not available in Fabric.js");
        }

        // Set up event handlers for object selection
        fabricCanvas.on("selection:created", handleObjectSelection);
        fabricCanvas.on("selection:updated", handleObjectSelection);
        fabricCanvas.on("selection:cleared", () => {
            selectedObject = null;
        });

        // Setup snapping to grid and center
        setupSnapping();

        // Check for Local Font Access API support
        checkFontAccessSupport();
    });

    onDestroy(() => {
        if (fabricCanvas) {
            fabricCanvas.dispose();
        }
    });

    function handleObjectSelection(e) {
        selectedObject = fabricCanvas.getActiveObject();
    }

    function setupSnapping() {
        if (!fabricCanvas) return;

        // Snap to center and edges
        fabricCanvas.on("object:moving", function (options) {
            const obj = options.target;
            const canvasWidth = fabricCanvas.getWidth();
            const canvasHeight = fabricCanvas.getHeight();
            const objWidth = obj.getScaledWidth();
            const objHeight = obj.getScaledHeight();

            // Center horizontally
            if (Math.abs(obj.left - canvasWidth / 2) < 10) {
                obj.set({
                    left: canvasWidth / 2,
                });
            }

            // Center vertically
            if (Math.abs(obj.top - canvasHeight / 2) < 10) {
                obj.set({
                    top: canvasHeight / 2,
                });
            }
        });
    }

    function updateCanvasSize() {
        if (!fabricCanvas) return;

        // Convert mm to pixels
        const widthPx = mmToPx(canvasWidthMM);
        const heightPx = mmToPx(canvasHeightMM);

        // Enforce max width limit based on selected printer
        if (currentConfig && canvasWidthMM > currentConfig.maxWidthMM) {
            canvasWidthMM = currentConfig.maxWidthMM;
        }

        // Enforce maximum label width
        if (canvasWidthMM > MAX_LABEL_WIDTH_MM) {
            canvasWidthMM = MAX_LABEL_WIDTH_MM;
        }

        // Apply canvas size changes
        fabricCanvas.setWidth(mmToPx(canvasWidthMM));
        fabricCanvas.setHeight(mmToPx(canvasHeightMM));
        fabricCanvas.renderAll();
    }

    // Printer connection functions
    async function connectPrinter() {
        if (isConnecting) return;

        isConnecting = true;
        status = "Connecting...";

        try {
            // Check if Web APIs are supported
            if (connectionType === "usb" && !navigator.usb) {
                throw new Error("WebUSB is not supported in this browser");
            }
            if (connectionType === "bluetooth" && !navigator.bluetooth) {
                throw new Error(
                    "WebBluetooth is not supported in this browser",
                );
            }

            const transport =
                connectionType === "usb"
                    ? new WebUSBTransport()
                    : new WebBluetoothTransport();

            printerClient = new PrinterClient(transport);
            await printerClient.connect();

            isConnected = true;
            status = "Connected";

            // Try to get device info
            try {
                const serial = await printerClient.getInfo(11);
                const version = await printerClient.getInfo(9);
                status = `Connected - ${currentConfig.name} - S/N: ${serial}`;
            } catch (error) {
                console.warn("Could not get device info:", error);
            }
        } catch (error) {
            console.error("Connection failed:", error);
            status = `Connection failed: ${error.message}`;
            isConnected = false;
            printerClient = null;
        } finally {
            isConnecting = false;
        }
    }

    async function disconnectPrinter() {
        if (printerClient) {
            try {
                await printerClient.disconnect();
            } catch (error) {
                console.warn("Disconnect error:", error);
            }
        }

        printerClient = null;
        isConnected = false;
        status = "Disconnected";
    }

    // Canvas operation functions
    function toggleDrawMode() {
        if (!fabricCanvas) return;
    
        try {
            // Toggle drawing mode
            fabricCanvas.isDrawingMode = !fabricCanvas.isDrawingMode;
            drawingMode = fabricCanvas.isDrawingMode;
        
            if (drawingMode) {
                // Ensure we have a brush and properly configure it
                if (!fabricCanvas.freeDrawingBrush) {
                    try {
                        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
                    } catch (e) {
                        console.error("Error creating PencilBrush:", e);
                        // Try alternative approach
                        fabricCanvas.freeDrawingBrush = fabricCanvas._createPencilBrush ? 
                            fabricCanvas._createPencilBrush() : null;
                        
                        if (!fabricCanvas.freeDrawingBrush) {
                            throw new Error("Could not create drawing brush");
                        }
                    }
                }
                
                if (fabricCanvas.freeDrawingBrush) {
                    // Configure the brush with current settings
                    fabricCanvas.freeDrawingBrush.width = penSize;
                    fabricCanvas.freeDrawingBrush.color = penColor;
                    fabricCanvas.freeDrawingBrush.strokeLineCap = 'round';
                    fabricCanvas.freeDrawingBrush.strokeLineJoin = 'round';
                }
                
                // Disable selection while in drawing mode
                fabricCanvas.selection = false;
                
                // Show cursor as crosshair in drawing mode
                if (fabricCanvas.upperCanvasEl) {
                    fabricCanvas.upperCanvasEl.style.cursor = 'crosshair';
                }
            } else {
                // Re-enable selection when exiting drawing mode
                fabricCanvas.selection = true;
                
                // Reset cursor
                if (fabricCanvas.upperCanvasEl) {
                    fabricCanvas.upperCanvasEl.style.cursor = 'default';
                }
            }
        
            // Ensure canvas receives focus for immediate drawing
            if (drawingMode && fabricCanvas.upperCanvasEl) {
                fabricCanvas.upperCanvasEl.focus();
            }
            
            // Refresh canvas
            fabricCanvas.renderAll();
        } catch (error) {
            console.error("Error toggling drawing mode:", error);
            status = `Error: ${error.message || "Could not enable drawing mode"}`;
            drawingMode = false;
            if (fabricCanvas) {
                fabricCanvas.isDrawingMode = false;
                fabricCanvas.selection = true;
            }
        }
    }

    function addText() {
        if (!fabricCanvas) return;

        const text = new fabric.IText("Enter text", {
            left: fabricCanvas.getWidth() / 2,
            top: fabricCanvas.getHeight() / 2,
            originX: "center",
            originY: "center",
            fontFamily: fontFamily,
            fontSize: fontSize,
            fill: textColor,
        });

        fabricCanvas.add(text);
        fabricCanvas.setActiveObject(text);
        text.enterEditing();
        fabricCanvas.renderAll();
    }

    function handleImageUpload(event) {
        if (!fabricCanvas || !event.target.files[0]) return;

        const file = event.target.files[0];
        
        // Validate file size
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            status = "Error: Image size exceeds 10MB limit";
            event.target.value = '';
            return;
        }
        
        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            status = `Error: Unsupported image format (${file.type})`;
            event.target.value = '';
            return;
        }

        // Show loading status
        status = `Loading image: ${file.name}...`;

        const reader = new FileReader();

        reader.onload = function (f) {
            const data = f.target.result;
            
            // Create an HTML image element to get accurate dimensions
            const imgEl = new Image();
            
            // Set crossOrigin to anonymous to avoid CORS issues
            imgEl.crossOrigin = 'anonymous';
            
            imgEl.onload = function() {
                try {
                    // Create fabric image from element to ensure proper rendering
                    const fabricImage = new fabric.Image(imgEl, {
                        originX: "center",
                        originY: "center",
                        left: fabricCanvas.getWidth() / 2,
                        top: fabricCanvas.getHeight() / 2,
                        crossOrigin: 'anonymous'
                    });
                    
                    // Initialize filters array to ensure it exists
                    fabricImage.filters = [];
                    
                    // Scale down large images
                    const maxWidth = fabricCanvas.getWidth() * 0.8;
                    const maxHeight = fabricCanvas.getHeight() * 0.8;

                    if (fabricImage.width > maxWidth || fabricImage.height > maxHeight) {
                        const scale = Math.min(
                            maxWidth / fabricImage.width,
                            maxHeight / fabricImage.height
                        );
                        fabricImage.scale(scale);
                    }

                    // Add to canvas
                    fabricCanvas.add(fabricImage);
                    fabricCanvas.setActiveObject(fabricImage);
                    fabricCanvas.renderAll();
                    
                    // Update selected object
                    selectedObject = fabricImage;
                    
                    // Reset status
                    status = isConnected ? `Connected - ${currentConfig?.name || ""}` : "Disconnected";
                } catch (error) {
                    console.error("Error creating image:", error);
                    status = `Error loading image: ${error.message || "Unknown error"}`;
                }
            };
            
            imgEl.onerror = function(e) {
                console.error("Image loading error:", e);
                status = "Error loading image: Invalid or corrupted image file";
            };
            
            // Set source to trigger load
            imgEl.src = data;
        };
        
        reader.onerror = function(e) {
            console.error("File reading error:", e);
            status = "Error reading file";
        };

        reader.readAsDataURL(file);
        
        // Clear the input value so the same file can be uploaded again
        event.target.value = '';
    }

    function alignObject(alignType) {
        if (!fabricCanvas || !selectedObject) return;

        const canvasWidth = fabricCanvas.getWidth();
        const canvasHeight = fabricCanvas.getHeight();

        switch (alignType) {
            case "left":
                selectedObject.set({ left: 0, originX: "left" });
                break;
            case "center-h":
                selectedObject.set({
                    left: canvasWidth / 2,
                    originX: "center",
                });
                break;
            case "right":
                selectedObject.set({ left: canvasWidth, originX: "right" });
                break;
            case "top":
                selectedObject.set({ top: 0, originY: "top" });
                break;
            case "center-v":
                selectedObject.set({
                    top: canvasHeight / 2,
                    originY: "center",
                });
                break;
            case "bottom":
                selectedObject.set({ top: canvasHeight, originY: "bottom" });
                break;
        }

        fabricCanvas.renderAll();
    }

    function deleteSelected() {
        if (!fabricCanvas || !selectedObject) return;
        fabricCanvas.remove(selectedObject);
        selectedObject = null;
        fabricCanvas.renderAll();
    }

    function clearCanvas() {
        if (!fabricCanvas) return;
        fabricCanvas.clear();
        fabricCanvas.backgroundColor = "white";
        fabricCanvas.renderAll();
    }

    // Check for Local Font Access API support
    function checkFontAccessSupport() {
        if (typeof window !== "undefined") {
            fontAccessSupported = "queryLocalFonts" in window;
            console.log(
                "Local Font Access API supported:",
                fontAccessSupported,
            );

            if (!fontAccessSupported) {
                // Provide info about browser support
                const browser = getBrowserInfo();
                console.log("Browser detected:", browser);

                if (
                    browser.includes("Chrome") &&
                    parseInt(browser.split(" ")[1]) < 87
                ) {
                    fontError =
                        "This browser doesn't support Local Font Access API. Use Chrome 87+ or Edge 87+";
                } else if (
                    !browser.includes("Chrome") &&
                    !browser.includes("Edge")
                ) {
                    fontError =
                        "Local Font Access API is only supported in Chrome and Edge browsers";
                } else {
                    fontError = "Local Font Access API is not available";
                }
            }
        }
    }

    // Helper to detect browser
    function getBrowserInfo() {
        const userAgent = navigator.userAgent;
        let browserInfo = "Unknown Browser";

        if (userAgent.indexOf("Chrome") > -1) {
            // Extract Chrome version
            const match = userAgent.match(/Chrome\/(\d+)/);
            const version = match ? match[1] : "?";
            browserInfo = `Chrome ${version}`;

            // Check for Edge (Chromium-based)
            if (userAgent.indexOf("Edg") > -1) {
                const edgeMatch = userAgent.match(/Edg\/(\d+)/);
                const edgeVersion = edgeMatch ? edgeMatch[1] : "?";
                browserInfo = `Edge ${edgeVersion}`;
            }
        } else if (userAgent.indexOf("Firefox") > -1) {
            browserInfo = "Firefox";
        } else if (userAgent.indexOf("Safari") > -1) {
            browserInfo = "Safari";
        }

        return browserInfo;
    }

    // Request access to local fonts and load them
    async function loadSystemFonts() {
        if (!fontAccessSupported) {
            fontError =
                "Local Font Access API is not supported in this browser";
            console.warn(fontError);
            return;
        }

        fontListLoading = true;
        fontError = null;

        try {
            // Request access to local fonts
            const fonts = await window.queryLocalFonts();
            fontAccessGranted = true;

            // Process fonts and add to systemFonts
            const uniqueFontFamilies = new Set();
            const fontMap = new Map(); // To track postscripts by family

            // Group fonts by family
            fonts.forEach((font) => {
                uniqueFontFamilies.add(font.family);

                // Store postscript name for actual font usage
                if (!fontMap.has(font.family)) {
                    fontMap.set(font.family, []);
                }
                fontMap.get(font.family).push(font);
            });

            // Update system fonts list with unique font families
            systemFonts = Array.from(uniqueFontFamilies).sort();
            console.log(`Loaded ${systemFonts.length} system fonts`);

            // Preload the first few fonts for immediate use
            const preloadFonts = systemFonts.slice(0, 20);
            let loadedCount = 0;

            for (const fontFamily of preloadFonts) {
                const familyFonts = fontMap.get(fontFamily);
                if (familyFonts && familyFonts.length > 0) {
                    try {
                        // Try to load a regular or first available style
                        const regularFont =
                            familyFonts.find(
                                (f) =>
                                    f.style === "Regular" ||
                                    f.style === "Normal" ||
                                    f.style === "Medium",
                            ) || familyFonts[0];

                        // Load the font data to make it available
                        const blob = await regularFont.blob();
                        const cssFont = new FontFace(fontFamily, blob);
                        await cssFont.load();
                        document.fonts.add(cssFont);
                        loadedCount++;
                    } catch (e) {
                        console.warn(
                            `Failed to preload font ${fontFamily}:`,
                            e,
                        );
                    }
                }
            }

            console.log(
                `Preloaded ${loadedCount} of ${preloadFonts.length} fonts`,
            );
        } catch (error) {
            console.error("Error loading system fonts:", error);
            if (error.name === "SecurityError") {
                fontError = "Permission to access local fonts was denied";
                console.warn(fontError);
            } else {
                fontError = `Error loading fonts: ${error.message || "Unknown error"}`;
            }
        } finally {
            fontListLoading = false;
        }
    }

    // Printing function
    async function printDesign() {
        if (!printerClient || !fabricCanvas || isPrinting) {
            return;
        }

        isPrinting = true;
        status = "Preparing design for printing...";

        try {
            // Convert Fabric.js canvas to a regular canvas for printing
            const printCanvas = document.createElement("canvas");
            printCanvas.width = fabricCanvas.getWidth();
            printCanvas.height = fabricCanvas.getHeight();
            
            const ctx = printCanvas.getContext("2d");
            
            // Set white background
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, printCanvas.width, printCanvas.height);
            
            try {
                // Draw Fabric.js canvas content to our print canvas
                const dataUrl = fabricCanvas.toDataURL({
                    format: "png",
                    quality: 1,
                    multiplier: 1
                });
                
                const img = new Image();
                img.crossOrigin = "anonymous";
                
                img.onload = async () => {
                    try {
                        // Draw the image onto the canvas
                        ctx.drawImage(img, 0, 0);
                        
                        // Update status
                        status = "Sending to printer...";
                        
                        // Send to printer
                        const options = {
                            density: density,
                        };
                        
                        await printerClient.printImage(printCanvas, options);
                        status = "Print completed successfully";
                    } catch (printError) {
                        console.error("Printing error:", printError);
                        status = `Print failed: ${printError.message || "Printing error"}`;
                    } finally {
                        isPrinting = false;
                    }
                };
                
                img.onerror = (error) => {
                    console.error("Image conversion error:", error);
                    status = `Print failed: Image conversion error`;
                    isPrinting = false;
                };
                
                // Set source to trigger loading
                img.src = dataUrl;
            } catch (canvasError) {
                throw new Error(`Canvas processing error: ${canvasError.message || "Unknown error"}`);
            }
        } catch (error) {
            console.error("Print failed:", error);
            status = `Print failed: ${error.message || "Unknown error"}`;
            isPrinting = false;
        }
    }

    // Handle canvas size changes
    function handleCanvasSizeChange() {
        // Make sure canvas width doesn't exceed MAX_LABEL_WIDTH_MM
        if (canvasWidthMM > MAX_LABEL_WIDTH_MM) {
            canvasWidthMM = MAX_LABEL_WIDTH_MM;
        }

        // Ensure width doesn't exceed printer's maximum width
        if (currentConfig && canvasWidthMM > currentConfig.maxWidthMM) {
            canvasWidthMM = currentConfig.maxWidthMM;
        }

        updateCanvasSize();
    }
</script>

<div class="min-h-screen flex flex-col bg-gray-100">
    <!-- Top Bar - Printer Connection -->
    <div class="bg-white shadow-md p-4">
        <div
            class="container mx-auto flex flex-wrap items-center justify-between"
        >
            <div class="flex items-center space-x-4">
                <h1 class="text-xl font-semibold text-gray-800">
                    Niimbot Label Designer
                </h1>
                <div class="flex items-center space-x-2">
                    <select
                        bind:value={connectionType}
                        disabled={isConnected}
                        class="border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                        <option value="usb">USB</option>
                        <option value="bluetooth">Bluetooth</option>
                    </select>

                    <select
                        bind:value={printerModel}
                        disabled={isConnected}
                        class="border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                        {#each Object.entries(printerConfigs) as [key, config]}
                            <option value={key}>{config.name}</option>
                        {/each}
                    </select>

                    {#if !isConnected}
                        <button
                            on:click={connectPrinter}
                            disabled={isConnecting}
                            class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                        >
                            {isConnecting ? "Connecting..." : "Connect"}
                        </button>
                    {:else}
                        <button
                            on:click={disconnectPrinter}
                            class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                        >
                            Disconnect
                        </button>
                    {/if}
                </div>
            </div>

            <div class="flex items-center">
                <span
                    class="text-sm px-2 py-1 rounded {isConnected
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'}"
                >
                    {status}
                </span>
            </div>
        </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex-grow flex flex-col md:flex-row overflow-hidden">
        <!-- Left Sidebar - Tools -->
        <div class="w-full md:w-64 bg-white shadow-md p-4 overflow-y-auto">
            <h2 class="font-semibold mb-4">Design Tools</h2>

            <!-- Canvas Size Controls -->
            <div class="mb-6">
                <h3 class="text-sm font-medium mb-2">Canvas Size</h3>
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="block text-xs text-gray-600 mb-1"
                            >Width (mm)</label
                        >
                        <input
                            type="number"
                            bind:value={canvasWidthMM}
                            on:change={handleCanvasSizeChange}
                            min="10"
                            max={Math.min(
                                MAX_LABEL_WIDTH_MM,
                                currentConfig?.maxWidthMM || MAX_LABEL_WIDTH_MM,
                            )}
                            step="0.5"
                            class="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                    </div>
                    <div>
                        <label class="block text-xs text-gray-600 mb-1"
                            >Height (mm)</label
                        >
                        <input
                            type="number"
                            bind:value={canvasHeightMM}
                            on:change={handleCanvasSizeChange}
                            min="10"
                            step="0.5"
                            class="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                    </div>
                </div>
                <div class="text-xs text-gray-500 mt-1">
                    Max width for {currentConfig?.name || "printer"}: {currentConfig?.maxWidthMM ||
                        0}mm
                </div>
            </div>

            <!-- Drawing Tools -->
            <div class="mb-6">
                <h3 class="text-sm font-medium mb-2">Tools</h3>
                <div class="space-y-2">
                    <button
                        on:click={toggleDrawMode}
                        class="w-full flex items-center px-3 py-2 rounded {drawingMode
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 hover:bg-gray-200'}"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4 mr-2"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                        </svg>
                        {drawingMode ? "Exit Drawing Mode" : "Draw Freehand"}
                    </button>

                    {#if drawingMode}
                        <div
                            class="mt-2 p-2 bg-blue-50 rounded border border-blue-100"
                        >
                            <div class="mb-2">
                                <label class="block text-xs text-gray-600 mb-1"
                                    >Pen Size</label
                                >
                                <div class="flex items-center">
                                    <input
                                        type="range"
                                        bind:value={penSize}
                                        min="1"
                                        max="20"
                                        class="flex-grow mr-2"
                                        on:input={() => {
                                            if (
                                                fabricCanvas &&
                                                fabricCanvas.freeDrawingBrush
                                            ) {
                                                fabricCanvas.freeDrawingBrush.width =
                                                    penSize;
                                            }
                                        }}
                                    />
                                    <span class="text-xs w-6 text-center"
                                        >{penSize}</span
                                    >
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs text-gray-600 mb-1"
                                    >Pen Color</label
                                >
                                <input
                                    type="color"
                                    bind:value={penColor}
                                    class="w-full h-8 p-0 border"
                                    on:input={() => {
                                        if (
                                            fabricCanvas &&
                                            fabricCanvas.freeDrawingBrush
                                        ) {
                                            fabricCanvas.freeDrawingBrush.color =
                                                penColor;
                                        }
                                    }}
                                />
                            </div>
                            <div class="text-xs text-blue-700 mt-2">
                                Draw directly on the canvas. Click "Exit Drawing
                                Mode" when finished.
                            </div>
                        </div>
                    {/if}

                    <button
                        on:click={addText}
                        class="w-full flex items-center px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4 mr-2"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                        </svg>
                        Add Text
                    </button>

                    <label
                        class="w-full flex items-center px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 cursor-pointer"
                        for="image-upload"
                        title="Import an image from your device (JPG, PNG, GIF, etc.)"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4 mr-2"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                        </svg>
                        Import Image
                        <input
                            id="image-upload"
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/bmp,image/webp"
                            on:change={handleImageUpload}
                            class="hidden"
                        />
                    </label>

                    {#if fontAccessSupported}
                        <button
                            class="w-full flex items-center px-3 py-2 rounded {fontAccessGranted
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 hover:bg-gray-200'}"
                            on:click={loadSystemFonts}
                            disabled={fontListLoading}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4 mr-2"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                />
                            </svg>
                            {#if fontListLoading}
                                Loading System Fonts...
                            {:else if fontAccessGranted}
                                System Fonts Loaded
                            {:else}
                                Load System Fonts
                            {/if}
                        </button>

                        {#if fontError}
                            <div
                                class="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs"
                            >
                                {fontError}
                            </div>
                        {/if}
                    {/if}
                </div>
            </div>

            <!-- Text Properties (when text is selected) -->
            {#if selectedObject && (selectedObject.type === "i-text" || selectedObject.type === "text")}
                <div class="mb-6">
                    <h3 class="text-sm font-medium mb-2">Text Properties</h3>
                    <div class="space-y-2">
                        <div>
                            <label class="block text-xs text-gray-600 mb-1"
                                >Font Family</label
                            >
                            <select
                                bind:value={selectedObject.fontFamily}
                                on:change={(e) => {
                                    currentFontPreview = e.target.value;
                                    fabricCanvas.renderAll();
                                }}
                                class="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                                {#each systemFonts as font}
                                    <option
                                        value={font}
                                        style="font-family: {font};"
                                        >{font}</option
                                    >
                                {/each}
                                {#if fontAccessSupported && !fontAccessGranted}
                                    <option disabled>──────────</option>
                                    <option disabled
                                        >Click "Load System Fonts" to see more
                                        fonts</option
                                    >
                                {/if}
                            </select>
                            <div class="mt-2 p-2 border rounded bg-white">
                                <p
                                    style="font-family: '{currentFontPreview}', sans-serif; font-size: 16px; line-height: 1.2;"
                                >
                                    {currentFontPreview}: The quick brown fox
                                    jumps over the lazy dog.
                                </p>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs text-gray-600 mb-1"
                                >Font Size</label
                            >
                            <div class="flex items-center">
                                <input
                                    type="range"
                                    bind:value={selectedObject.fontSize}
                                    on:input={() => fabricCanvas.renderAll()}
                                    min="8"
                                    max="72"
                                    class="flex-grow mr-2"
                                />
                                <input
                                    type="number"
                                    bind:value={selectedObject.fontSize}
                                    on:change={() => fabricCanvas.renderAll()}
                                    min="8"
                                    max="200"
                                    class="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs text-gray-600 mb-1"
                                >Text Color</label
                            >
                            <input
                                type="color"
                                bind:value={selectedObject.fill}
                                on:input={() => fabricCanvas.renderAll()}
                                class="w-full h-8 p-0 border"
                            />
                        </div>

                        <div>
                            <label class="block text-xs text-gray-600 mb-1"
                                >Text Style</label
                            >
                            <div class="flex space-x-2">
                                <button
                                    class="border rounded p-1 {selectedObject.fontWeight ===
                                    'bold'
                                        ? 'bg-blue-100'
                                        : 'bg-gray-100'}"
                                    on:click={() => {
                                        selectedObject.set({
                                            fontWeight:
                                                selectedObject.fontWeight ===
                                                "bold"
                                                    ? "normal"
                                                    : "bold",
                                        });
                                        fabricCanvas.renderAll();
                                    }}
                                    title="Bold"
                                >
                                    <span class="font-bold text-sm">B</span>
                                </button>

                                <button
                                    class="border rounded p-1 {selectedObject.fontStyle ===
                                    'italic'
                                        ? 'bg-blue-100'
                                        : 'bg-gray-100'}"
                                    on:click={() => {
                                        selectedObject.set({
                                            fontStyle:
                                                selectedObject.fontStyle ===
                                                "italic"
                                                    ? "normal"
                                                    : "italic",
                                        });
                                        fabricCanvas.renderAll();
                                    }}
                                    title="Italic"
                                >
                                    <span class="italic text-sm">I</span>
                                </button>

                                <button
                                    class="border rounded p-1 {selectedObject.underline
                                        ? 'bg-blue-100'
                                        : 'bg-gray-100'}"
                                    on:click={() => {
                                        selectedObject.set({
                                            underline:
                                                !selectedObject.underline,
                                        });
                                        fabricCanvas.renderAll();
                                    }}
                                    title="Underline"
                                >
                                    <span class="underline text-sm">U</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Image Properties (when image is selected) -->
            {#if selectedObject && selectedObject.type === "image"}
                <div class="mb-6">
                    <h3 class="text-sm font-medium mb-2">Image Properties</h3>
                    <div class="space-y-2">
                        <div>
                            <label class="block text-xs text-gray-600 mb-1">Opacity</label>
                            <div class="flex items-center">
                                <input 
                                    type="range" 
                                    bind:value={selectedObject.opacity} 
                                    min="0" 
                                    max="1" 
                                    step="0.01"
                                    on:input={() => fabricCanvas.renderAll()}
                                    class="flex-grow mr-2"
                                />
                                <span class="text-xs w-8 text-center">{Math.round(selectedObject.opacity * 100)}%</span>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-xs text-gray-600 mb-1">Filters</label>
                            <div class="grid grid-cols-2 gap-1">
                                <button 
                                    on:click={() => {
                                        if (selectedObject && selectedObject.type === "image") {
                                            try {
                                                // Clear existing filters of same type
                                                selectedObject.filters = selectedObject.filters.filter(
                                                    f => !(f instanceof fabric.Image.filters.Grayscale)
                                                );
                                                // Add grayscale filter
                                                selectedObject.filters.push(new fabric.Image.filters.Grayscale());
                                                selectedObject.applyFilters();
                                                fabricCanvas.renderAll();
                                            } catch (error) {
                                                console.error("Error applying filter:", error);
                                                status = "Error applying filter";
                                            }
                                        }
                                    }}
                                    class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                                >
                                    Grayscale
                                </button>
                                
                                <button 
                                    on:click={() => {
                                        if (selectedObject && selectedObject.type === "image") {
                                            try {
                                                // Clear existing filters of same type
                                                selectedObject.filters = selectedObject.filters.filter(
                                                    f => !(f instanceof fabric.Image.filters.Invert)
                                                );
                                                // Add invert filter
                                                selectedObject.filters.push(new fabric.Image.filters.Invert());
                                                selectedObject.applyFilters();
                                                fabricCanvas.renderAll();
                                            } catch (error) {
                                                console.error("Error applying filter:", error);
                                                status = "Error applying filter";
                                            }
                                        }
                                    }}
                                    class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                                >
                                    Invert
                                </button>
                                
                                <button 
                                    on:click={() => {
                                        if (selectedObject && selectedObject.type === "image") {
                                            try {
                                                // Clear existing filters of same type
                                                selectedObject.filters = selectedObject.filters.filter(
                                                    f => !(f instanceof fabric.Image.filters.Brightness)
                                                );
                                                // Add brightness filter
                                                selectedObject.filters.push(new fabric.Image.filters.Brightness({brightness: 0.1}));
                                                selectedObject.applyFilters();
                                                fabricCanvas.renderAll();
                                            } catch (error) {
                                                console.error("Error applying filter:", error);
                                                status = "Error applying filter";
                                            }
                                        }
                                    }}
                                    class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                                >
                                    Brighten
                                </button>
                                
                                <button 
                                    on:click={() => {
                                        if (selectedObject && selectedObject.type === "image") {
                                            try {
                                                // Clear existing filters of same type
                                                selectedObject.filters = selectedObject.filters.filter(
                                                    f => !(f instanceof fabric.Image.filters.Contrast)
                                                );
                                                // Add contrast filter
                                                selectedObject.filters.push(new fabric.Image.filters.Contrast({contrast: 0.1}));
                                                selectedObject.applyFilters();
                                                fabricCanvas.renderAll();
                                            } catch (error) {
                                                console.error("Error applying filter:", error);
                                                status = "Error applying filter";
                                            }
                                        }
                                    }}
                                    class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                                >
                                    Contrast
                                </button>
                            </div>
                            
                            <button 
                                on:click={() => {
                                    if (selectedObject && selectedObject.type === "image") {
                                        try {
                                            // Clear all filters
                                            selectedObject.filters = [];
                                            selectedObject.applyFilters();
                                            fabricCanvas.renderAll();
                                        } catch (error) {
                                            console.error("Error resetting filters:", error);
                                            status = "Error resetting filters";
                                        }
                                    }
                                }}
                                class="w-full mt-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                            >
                                Reset Filters
                            </button>
                        </div>
                        
                        <div>
                            <label class="block text-xs text-gray-600 mb-1">Rotation</label>
                            <div class="grid grid-cols-3 gap-1">
                                <button 
                                    on:click={() => {
                                        if (selectedObject && selectedObject.type === "image") {
                                            selectedObject.rotate((selectedObject.angle || 0) - 90);
                                            fabricCanvas.renderAll();
                                        }
                                    }}
                                    class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                                >
                                    ↺ 90°
                                </button>
                                
                                <button 
                                    on:click={() => {
                                        if (selectedObject && selectedObject.type === "image") {
                                            selectedObject.rotate((selectedObject.angle || 0) + 90);
                                            fabricCanvas.renderAll();
                                        }
                                    }}
                                    class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                                >
                                    ↻ 90°
                                </button>
                                
                                <button 
                                    on:click={() => {
                                        if (selectedObject && selectedObject.type === "image") {
                                            selectedObject.rotate(0);
                                            fabricCanvas.renderAll();
                                        }
                                    }}
                                    class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-xs text-gray-600 mb-1">Flip</label>
                            <div class="grid grid-cols-2 gap-1">
                                <button 
                                    on:click={() => {
                                        if (selectedObject && selectedObject.type === "image") {
                                            selectedObject.set('flipX', !selectedObject.flipX);
                                            fabricCanvas.renderAll();
                                        }
                                    }}
                                    class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                                >
                                    Horizontal
                                </button>
                                
                                <button 
                                    on:click={() => {
                                        if (selectedObject && selectedObject.type === "image") {
                                            selectedObject.set('flipY', !selectedObject.flipY);
                                            fabricCanvas.renderAll();
                                        }
                                    }}
                                    class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                                >
                                    Vertical
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
            
            <!-- Object Properties (when any object is selected) -->
            {#if selectedObject}
                <div class="mb-6">
                    <h3 class="text-sm font-medium mb-2">Alignment</h3>
                    <div class="grid grid-cols-3 gap-1 mb-2">
                        <button
                            aria-label="Align Left"
                            on:click={() => alignObject("left")}
                            class="flex items-center justify-center py-1 bg-gray-100 hover:bg-gray-200 rounded"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        </button>
                        <button
                            aria-label="Center Horizontally"
                            on:click={() => alignObject("center-h")}
                            class="flex items-center justify-center py-1 bg-gray-100 hover:bg-gray-200 rounded"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        </button>
                        <button
                            aria-label="Align Right"
                            on:click={() => alignObject("right")}
                            class="flex items-center justify-center py-1 bg-gray-100 hover:bg-gray-200 rounded"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM9 10a1 1 0 011-1h6a1 1 0 110 2h-6a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        </button>
                    </div>

                    <div class="grid grid-cols-3 gap-1">
                        <button
                            aria-label="Align Top"
                            on:click={() => alignObject("top")}
                            class="flex items-center justify-center py-1 bg-gray-100 hover:bg-gray-200 rounded"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path
                                    d="M5 4a1 1 0 011-1h8a1 1 0 011 1v1H5V4zM3 6a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM5 15a1 1 0 011-1h8a1 1 0 011 1v1H5v-1z"
                                />
                            </svg>
                        </button>
                        <button
                            aria-label="Center Vertically"
                            on:click={() => alignObject("center-v")}
                            class="flex items-center justify-center py-1 bg-gray-100 hover:bg-gray-200 rounded"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path
                                    d="M10 3a1 1 0 011 1v2a1 1 0 11-2 0V4a1 1 0 011-1zM10 8a1 1 0 011 1v2a1 1 0 11-2 0V9a1 1 0 011-1zM10 13a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1z"
                                />
                            </svg>
                        </button>
                        <button
                            aria-label="Align Bottom"
                            on:click={() => alignObject("bottom")}
                            class="flex items-center justify-center py-1 bg-gray-100 hover:bg-gray-200 rounded"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path
                                    d="M5 3a1 1 0 011-1h8a1 1 0 011 1v1H5V3zM3 6a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM5 14a1 1 0 011-1h8a1 1 0 011 1v3H5v-3z"
                                />
                            </svg>
                        </button>
                    </div>

                    <button
                        on:click={deleteSelected}
                        class="w-full mt-3 flex items-center justify-center px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4 mr-1"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                        </svg>
                        Delete Object
                    </button>
                </div>
            {/if}
        </div>

        <!-- Main Canvas Area -->
        <div class="flex-grow p-4 flex flex-col">
            <div
                class="bg-gray-50 border rounded-lg p-4 flex-grow flex flex-col"
            >
                <div class="text-sm text-gray-600 mb-2">
                    Design Size: {canvasWidthMM}mm × {canvasHeightMM}mm
                </div>
                <div
                    class="flex-grow flex items-center justify-center bg-gray-200 overflow-auto"
                    bind:this={canvasContainer}
                >
                    <div class="relative shadow-lg">
                        <canvas id="design-canvas"></canvas>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Bottom Bar - Print Controls -->
    <div class="bg-white shadow-md p-4">
        <div
            class="container mx-auto flex flex-wrap justify-between items-center"
        >
            <div class="flex items-center space-x-4">
                <button
                    on:click={clearCanvas}
                    class="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
                >
                    Clear Design
                </button>

                <div class="flex items-center">
                    <span class="text-sm mr-2">Print Density:</span>
                    <input
                        type="range"
                        bind:value={density}
                        min="1"
                        max={maxDensity}
                        class="w-24"
                    />
                    <span class="text-sm ml-1">{density}</span>
                </div>
            </div>

            <button
                on:click={printDesign}
                disabled={!isConnected || isPrinting}
                class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
            >
                {isPrinting ? "Printing..." : "Print Design"}
            </button>
        </div>
    </div>
</div>
