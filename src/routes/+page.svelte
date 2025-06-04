<!-- PrinterControl.svelte -->
<script>
    import { onMount } from "svelte";
    import {
        WebUSBTransport,
        WebBluetoothTransport,
        PrinterClient,
    } from "$lib/printerController.js";

    let connectionType = "usb";
    let printerClient = null;
    let isConnected = false;
    let isConnecting = false;
    let isPrinting = false;
    let status = "Disconnected";
    let selectedFile = null;
    let canvas = null;
    let canvasContext = null;
    let density = 3;
    let rotation = 0;
    let printerModel = "b21";

    // Printer model configurations
    const printerConfigs = {
        b1: { maxWidth: 384, maxDensity: 5 },
        b18: { maxWidth: 384, maxDensity: 3 },
        b21: { maxWidth: 384, maxDensity: 5 },
        d11: { maxWidth: 96, maxDensity: 3 },
        d110: { maxWidth: 96, maxDensity: 3 },
    };

    $: currentConfig = printerConfigs[printerModel];
    $: maxDensity = currentConfig.maxDensity;

    onMount(() => {
        // Create canvas for image processing
        canvas = document.createElement("canvas");
        canvasContext = canvas.getContext("2d");
    });

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
                status = `Connected - Serial: ${serial}, Version: ${version}`;
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

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            selectedFile = file;
            loadImageToCanvas(file);
        }
    }

    function loadImageToCanvas(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Apply rotation and resize logic
                let { width, height } = img;

                // Apply rotation
                if (rotation === 90 || rotation === 270) {
                    [width, height] = [height, width];
                }

                // Check width constraints
                if (width > currentConfig.maxWidth) {
                    const scale = currentConfig.maxWidth / width;
                    width = currentConfig.maxWidth;
                    height = Math.round(height * scale);
                }

                canvas.width = width;
                canvas.height = height;

                // Clear and draw image
                canvasContext.clearRect(0, 0, width, height);

                if (rotation !== 0) {
                    canvasContext.save();
                    canvasContext.translate(width / 2, height / 2);
                    canvasContext.rotate((rotation * Math.PI) / 180);
                    canvasContext.drawImage(
                        img,
                        -img.width / 2,
                        -img.height / 2,
                        img.width,
                        img.height,
                    );
                    canvasContext.restore();
                } else {
                    canvasContext.drawImage(img, 0, 0, width, height);
                }

                // Update preview
                updatePreview();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function updatePreview() {
        const previewCanvas = document.getElementById("preview-canvas");
        if (previewCanvas && canvas) {
            const previewCtx = previewCanvas.getContext("2d");
            previewCanvas.width = canvas.width;
            previewCanvas.height = canvas.height;
            previewCtx.drawImage(canvas, 0, 0);
        }
    }

    async function printImage() {
        if (!printerClient || !canvas || isPrinting) {
            return;
        }

        isPrinting = true;
        status = "Printing...";

        try {
            await printerClient.printImage(canvas, density);
            status = "Print completed successfully";
        } catch (error) {
            console.error("Print failed:", error);
            status = `Print failed: ${error.message}`;
        } finally {
            isPrinting = false;
        }
    }

    function rotateImage() {
        rotation = (rotation + 90) % 360;
        if (selectedFile) {
            loadImageToCanvas(selectedFile);
        }
    }

    // Reactive statement to update density if it exceeds max for current printer
    $: if (density > maxDensity) {
        density = maxDensity;
    }
</script>

<div class="printer-control">
    <h2>Niimbot Printer Control</h2>

    <div class="connection-section">
        <h3>Connection</h3>

        <div class="form-group">
            <label>
                Connection Type:
                <select bind:value={connectionType} disabled={isConnected}>
                    <option value="usb">USB</option>
                    <option value="bluetooth">Bluetooth</option>
                </select>
            </label>
        </div>

        <div class="form-group">
            <label>
                Printer Model:
                <select bind:value={printerModel} disabled={isConnected}>
                    <option value="b1">B1</option>
                    <option value="b18">B18</option>
                    <option value="b21">B21</option>
                    <option value="d11">D11</option>
                    <option value="d110">D110</option>
                </select>
            </label>
        </div>

        <div class="button-group">
            {#if !isConnected}
                <button
                    on:click={connectPrinter}
                    disabled={isConnecting}
                    class="connect-btn"
                >
                    {isConnecting ? "Connecting..." : "Connect"}
                </button>
            {:else}
                <button on:click={disconnectPrinter} class="disconnect-btn">
                    Disconnect
                </button>
            {/if}
        </div>

        <div class="status">
            Status: {status}
        </div>
    </div>

    <div class="print-section">
        <h3>Print Settings</h3>

        <div class="form-group">
            <label>
                Image File:
                <input
                    type="file"
                    accept="image/*"
                    on:change={handleFileSelect}
                    disabled={!isConnected}
                />
            </label>
        </div>

        <div class="form-group">
            <label>
                Density (1-{maxDensity}):
                <input
                    type="range"
                    min="1"
                    max={maxDensity}
                    bind:value={density}
                    disabled={!selectedFile}
                />
                <span>{density}</span>
            </label>
        </div>

        <div class="button-group">
            <button
                on:click={rotateImage}
                disabled={!selectedFile}
                class="rotate-btn"
            >
                Rotate 90°
            </button>

            <button
                on:click={printImage}
                disabled={!isConnected || !selectedFile || isPrinting}
                class="print-btn"
            >
                {isPrinting ? "Printing..." : "Print"}
            </button>
        </div>
    </div>

    <div class="preview-section">
        <h3>Preview</h3>
        <canvas id="preview-canvas" class="preview-canvas"></canvas>
        <p class="info">Max width: {currentConfig.maxWidth}px</p>
    </div>
</div>

<style>
    .printer-control {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        font-family: Arial, sans-serif;
    }

    .connection-section,
    .print-section,
    .preview-section {
        margin-bottom: 30px;
        padding: 20px;
        border: 1px solid #ddd;
        border-radius: 8px;
        background: #f9f9f9;
    }

    .form-group {
        margin-bottom: 15px;
    }

    .form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
    }

    .form-group input,
    .form-group select {
        width: 200px;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
    }

    .form-group input[type="range"] {
        width: 150px;
    }

    .button-group {
        display: flex;
        gap: 10px;
        margin-top: 15px;
    }

    button {
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
    }

    .connect-btn {
        background: #007bff;
        color: white;
    }

    .connect-btn:hover:not(:disabled) {
        background: #0056b3;
    }

    .disconnect-btn {
        background: #dc3545;
        color: white;
    }

    .disconnect-btn:hover {
        background: #c82333;
    }

    .rotate-btn {
        background: #ffc107;
        color: black;
    }

    .rotate-btn:hover:not(:disabled) {
        background: #e0a800;
    }

    .print-btn {
        background: #28a745;
        color: white;
    }

    .print-btn:hover:not(:disabled) {
        background: #218838;
    }

    button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .status {
        margin-top: 10px;
        padding: 10px;
        background: #e9ecef;
        border-radius: 4px;
        font-weight: bold;
    }

    .preview-canvas {
        max-width: 100%;
        border: 1px solid #ccc;
        background: white;
    }

    .info {
        margin-top: 10px;
        color: #666;
        font-size: 14px;
    }

    h2,
    h3 {
        color: #333;
    }
</style>
