<script>
    import { onMount, tick } from "svelte";
    import * as fabric from "fabric";
    import { printViaUSB, printViaBLE } from "$lib/printer.js";

    let canvasEl;
    let fabricCanvas;
    let labelWidth = 60;
    let labelHeight = 30;
    let pxPerMm = 8;
    let canvasWidth = 0;
    let canvasHeight = 0;
    let customText = "";
    let initialized = false;

    // Font settings
    let fontFamily = "sans-serif";
    let fontSize = 20;

    // Print settings
    let mode = "usb"; // 'usb' or 'ble'
    let density = 3;

    async function initCanvas() {
        canvasWidth = labelWidth * pxPerMm;
        canvasHeight = labelHeight * pxPerMm;
        initialized = true;
        await tick();
        fabricCanvas = new fabric.Canvas(canvasEl, {
            width: canvasWidth,
            height: canvasHeight,
            backgroundColor: "white",
        });
        const text = new fabric.Text("샘플 텍스트", {
            left: 10,
            top: 10,
            fontSize,
            fontFamily,
            fill: "black",
        });
        fabricCanvas.add(text);
    }

    async function addText() {
        if (!customText.trim()) return;
        const text = new fabric.Text(customText, {
            left: 20,
            top: 20,
            fontSize,
            fontFamily,
            fill: "black",
        });
        fabricCanvas.add(text);
        customText = "";
    }

    function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (f) => {
            fabric.Image.fromURL(f.target.result, (img) => {
                const maxW = canvasWidth * 0.6;
                const maxH = canvasHeight * 0.6;
                const scale = Math.min(maxW / img.width, maxH / img.height, 1);
                img.set({ left: 10, top: 50, scaleX: scale, scaleY: scale });
                fabricCanvas.add(img);
            });
        };
        reader.readAsDataURL(file);
    }

    function deleteSelected() {
        const active = fabricCanvas.getActiveObject();
        if (active) fabricCanvas.remove(active);
    }

    function alignCenter() {
        const active = fabricCanvas.getActiveObject();
        if (!active) return;
        const bounds = active.getBoundingRect(true);
        const centerX =
            (canvasWidth - bounds.width) / 2 - bounds.left + active.left;
        const centerY =
            (canvasHeight - bounds.height) / 2 - bounds.top + active.top;
        active.set({ left: centerX, top: centerY });
        active.setCoords();
        fabricCanvas.renderAll();
    }

    async function onPrint() {
        if (!fabricCanvas) return alert("먼저 캔버스를 생성하세요");
        if (mode === "usb") {
            await printViaUSB(canvasEl, { density });
        } else {
            await printViaBLE(canvasEl, { density });
        }
        alert("출력이 완료되었습니다.");
    }
</script>

<main class="p-6 space-y-6">
    <h1 class="text-2xl font-bold">🧾 Niimbot 라벨 프린터</h1>

    {#if !initialized}
        <div class="flex items-center space-x-4">
            <label class="flex items-center space-x-2">
                <span>가로(mm):</span>
                <input
                    type="number"
                    bind:value={labelWidth}
                    min="10"
                    class="border px-2 w-20"
                />
            </label>
            <label class="flex items-center space-x-2">
                <span>세로(mm):</span>
                <input
                    type="number"
                    bind:value={labelHeight}
                    min="10"
                    class="border px-2 w-20"
                />
            </label>
            <button
                class="px-4 py-2 bg-green-600 text-white rounded"
                on:click={initCanvas}>캔버스 생성</button
            >
        </div>
    {:else}
        <div class="space-y-4">
            <div class="flex flex-wrap items-center space-x-4">
                <div class="flex items-center space-x-4">
                    <span>모드:</span>
                    <label class="flex items-center space-x-1">
                        <input
                            type="radio"
                            bind:group={mode}
                            value="usb"
                            class="form-radio"
                        />
                        <span>USB</span>
                    </label>
                    <label class="flex items-center space-x-1">
                        <input
                            type="radio"
                            bind:group={mode}
                            value="ble"
                            class="form-radio"
                        />
                        <span>Bluetooth</span>
                    </label>
                </div>
                <label class="flex items-center space-x-2">
                    <span>밀도:</span>
                    <input type="range" min="1" max="5" bind:value={density} />
                    <span>{density}</span>
                </label>
                <button
                    class="px-4 py-2 bg-green-600 text-white rounded"
                    on:click={onPrint}>출력</button
                >
            </div>

            <div class="flex flex-wrap items-center space-x-4">
                <label class="flex items-center space-x-2">
                    <span>폰트 패밀리:</span>
                    <select bind:value={fontFamily} class="border px-2 py-1">
                        <option value="sans-serif">sans-serif</option>
                        <option value="serif">serif</option>
                        <option value="monospace">monospace</option>
                        <option value="cursive">cursive</option>
                        <option value="fantasy">fantasy</option>
                    </select>
                </label>
                <label class="flex items-center space-x-2">
                    <span>폰트 크기:</span>
                    <input
                        type="number"
                        bind:value={fontSize}
                        min="8"
                        class="border px-2 py-1 w-20"
                    />
                </label>
                <button
                    class="px-3 py-1 bg-indigo-600 text-white rounded"
                    on:click={() => {
                        const obj = fabricCanvas.getActiveObject();
                        if (obj) {
                            obj.set({ fontFamily, fontSize });
                            obj.setCoords();
                            fabricCanvas.renderAll();
                        }
                    }}>폰트 적용</button
                >
            </div>

            <div class="flex space-x-2">
                <button
                    class="px-3 py-1 bg-red-500 text-white rounded"
                    on:click={deleteSelected}>선택 삭제</button
                >
                <button
                    class="px-3 py-1 bg-gray-600 text-white rounded"
                    on:click={alignCenter}>중앙 정렬</button
                >
            </div>

            <canvas
                bind:this={canvasEl}
                width={canvasWidth}
                height={canvasHeight}
                class="border border-gray-400 block"
                style="image-rendering: pixelated;"
            ></canvas>
        </div>
    {/if}
</main>

<style>
    canvas {
        max-width: 100%;
        height: auto;
    }
    .btn {
        padding: 0.5rem 1rem;
        border-radius: 0.375rem;
    }
    .btn-green {
        background-color: #16a34a;
        color: white;
    }
</style>
