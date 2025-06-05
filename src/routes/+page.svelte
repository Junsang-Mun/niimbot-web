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

        // Toggle drawing mode
        fabricCanvas.isDrawingMode = !fabricCanvas.isDrawingMode;
        drawingMode = fabricCanvas.isDrawingMode;

        if (drawingMode) {
            // Ensure we have a brush and properly configure it
            if (!fabricCanvas.freeDrawingBrush) {
                try {
                    fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(
                        fabricCanvas,
                    );
                } catch (e) {
                    console.error("Error creating PencilBrush:", e);
                    // Try alternative approach
                    fabricCanvas.freeDrawingBrush =
                        fabricCanvas._createPencilBrush
                            ? fabricCanvas._createPencilBrush()
                            : null;
                }
            }

            if (fabricCanvas.freeDrawingBrush) {
                // Configure the brush with current settings
                fabricCanvas.freeDrawingBrush.width = penSize;
                fabricCanvas.freeDrawingBrush.color = penColor;
                fabricCanvas.freeDrawingBrush.strokeLineCap = "round";
                fabricCanvas.freeDrawingBrush.strokeLineJoin = "round";
            }

            // Disable selection while in drawing mode
            fabricCanvas.selection = false;

            // Show cursor as crosshair in drawing mode
            if (fabricCanvas.upperCanvasEl) {
                fabricCanvas.upperCanvasEl.style.cursor = "crosshair";
            }
        } else {
            // Re-enable selection when exiting drawing mode
            fabricCanvas.selection = true;

            // Reset cursor
            if (fabricCanvas.upperCanvasEl) {
                fabricCanvas.upperCanvasEl.style.cursor = "default";
            }
        }

        // Ensure canvas receives focus for immediate drawing
        if (drawingMode && fabricCanvas.upperCanvasEl) {
            fabricCanvas.upperCanvasEl.focus();
        }

        // Refresh canvas
        fabricCanvas.renderAll();
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
        const reader = new FileReader();

        reader.onload = function (f) {
            const data = f.target.result;
            fabric.Image.fromURL(data, function (img) {
                // Scale down large images
                const maxWidth = fabricCanvas.getWidth() * 0.8;
                const maxHeight = fabricCanvas.getHeight() * 0.8;

                if (img.width > maxWidth || img.height > maxHeight) {
                    const scale = Math.min(
                        maxWidth / img.width,
                        maxHeight / img.height,
                    );
                    img.scale(scale);
                }

                img.set({
                    left: fabricCanvas.getWidth() / 2,
                    top: fabricCanvas.getHeight() / 2,
                    originX: "center",
                    originY: "center",
                });

                fabricCanvas.add(img);
                fabricCanvas.setActiveObject(img);
                fabricCanvas.renderAll();
            });
        };

        reader.readAsDataURL(file);
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

    // Font handling functions
    function handleFontUpload(event) {
        if (!event.target.files[0]) return;

        const file = event.target.files[0];
        const fontName = file.name.split(".")[0];
        const reader = new FileReader();

        reader.onload = function (e) {
            const fontData = e.target.result;

            // Add font to document
            const fontFace = new FontFace(fontName, fontData);
            document.fonts.add(fontFace);

            fontFace
                .load()
                .then(() => {
                    // Update font dropdown
                    fontFamily = fontName;

                    // Apply to selected text object if applicable
                    if (
                        selectedObject &&
                        selectedObject.type.includes("text")
                    ) {
                        selectedObject.set({ fontFamily: fontName });
                        fabricCanvas.renderAll();
                    }
                })
                .catch((err) => {
                    console.error("Font loading failed:", err);
                    status = `Font loading failed: ${err.message}`;
                });
        };

        reader.readAsArrayBuffer(file);
    }

    // Printing function
    async function printDesign() {
        if (!printerClient || !fabricCanvas || isPrinting) {
            return;
        }

        isPrinting = true;
        status = "Printing...";

        try {
            // Convert Fabric.js canvas to a regular canvas for printing
            const printCanvas = document.createElement("canvas");
            printCanvas.width = fabricCanvas.getWidth();
            printCanvas.height = fabricCanvas.getHeight();

            const ctx = printCanvas.getContext("2d");
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, printCanvas.width, printCanvas.height);

            // Draw Fabric.js canvas content to our print canvas
            const dataUrl = fabricCanvas.toDataURL({
                format: "png",
                quality: 1,
            });

            const img = new Image();
            img.onload = async () => {
                ctx.drawImage(img, 0, 0);

                // Send to printer
                const options = {
                    density: density,
                };

                await printerClient.printImage(printCanvas, options);
                status = "Print completed successfully";
                isPrinting = false;
            };

            img.onerror = (error) => {
                console.error("Image conversion error:", error);
                status = `Print failed: Image conversion error`;
                isPrinting = false;
            };

            img.src = dataUrl;
        } catch (error) {
            console.error("Print failed:", error);
            status = `Print failed: ${error.message}`;
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
                            type="file"
                            accept="image/*"
                            on:change={handleImageUpload}
                            class="hidden"
                        />
                    </label>

                    <label
                        class="w-full flex items-center px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 cursor-pointer"
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
                                d="M9.269 16.774l5.444-5.444m-4.338-1.106l4.338 4.338"
                            />
                        </svg>
                        Upload Font
                        <input
                            type="file"
                            accept=".ttf,.otf,.woff,.woff2"
                            on:change={handleFontUpload}
                            class="hidden"
                        />
                    </label>
                </div>
            </div>

            <!-- Text Properties (when text is selected) -->
            {#if selectedObject && selectedObject.type === "i-text"}
                <div class="mb-6">
                    <h3 class="text-sm font-medium mb-2">Text Properties</h3>
                    <div class="space-y-2">
                        <div>
                            <label class="block text-xs text-gray-600 mb-1"
                                >Font Family</label
                            >
                            <select
                                bind:value={selectedObject.fontFamily}
                                on:change={() => fabricCanvas.renderAll()}
                                class="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                                <option value="Arial">Arial</option>
                                <option value="Times New Roman"
                                    >Times New Roman</option
                                >
                                <option value="Courier New">Courier New</option>
                                <option value="Georgia">Georgia</option>
                                <option value="Verdana">Verdana</option>
                            </select>
                        </div>

                        <div>
                            <label class="block text-xs text-gray-600 mb-1"
                                >Font Size</label
                            >
                            <input
                                type="range"
                                bind:value={selectedObject.fontSize}
                                on:input={() => fabricCanvas.renderAll()}
                                min="8"
                                max="72"
                                class="w-full"
                            />
                            <span class="text-xs"
                                >{selectedObject.fontSize}px</span
                            >
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
