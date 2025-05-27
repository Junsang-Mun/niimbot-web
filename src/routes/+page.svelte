<script>
    import { onMount, tick } from "svelte";
    import * as fabric from "fabric";
    import { printViaUSB, printViaBLE } from "$lib/printer.js";

    let canvasEl;
    let imgInput;
    let fabricCanvas;
    let labelWidth = 60;
    let labelHeight = 30;
    let pxPerMm = 8;
    let canvasWidth = 0;
    let canvasHeight = 0;
    let customText = "";
    let initialized = false;

    // Font settings
    let systemFonts = [];
    let fontFamily = "sans-serif";
    let fontSize = 20;
    let fontError = "";

    // Print settings
    let mode = "usb";
    let density = 3;

    // Load local fonts at mount
    async function loadSystemFonts() {
        try {
            if (typeof window.queryLocalFonts === "function") {
                const fonts = await window.queryLocalFonts();
                systemFonts = Array.from(
                    new Set(fonts.map((f) => f.family)),
                ).sort();
            } else {
                throw new Error("Local Font Access API not supported");
            }
        } catch (e) {
            fontError = e.message;
            systemFonts = [
                "sans-serif",
                "serif",
                "monospace",
                "cursive",
                "fantasy",
            ];
        }
        fontFamily = systemFonts[0];
    }

    onMount(() => {
        loadSystemFonts();
    });

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
            fontFamily,
            fontSize,
            fill: "black",
        });
        fabricCanvas.add(text);
    }

    function handleImageUpload(event) {
        const file = event.target.files?.[0];
        if (!file || !fabricCanvas) {
            console.log("파일이나 캔버스가 없습니다:", {
                file: !!file,
                canvas: !!fabricCanvas,
            });
            return;
        }

        console.log("파일 선택됨:", file.name, file.type);

        const reader = new FileReader();

        reader.onload = function (e) {
            const dataURL = e.target.result;
            console.log("파일 읽기 완료, 이미지 생성 시도");

            // Fabric.js v5+ 방식 (Promise 기반)
            if (fabric.Image.fromURL.length === 1) {
                fabric.Image.fromURL(dataURL)
                    .then((img) => {
                        addImageToCanvas(img);
                    })
                    .catch((error) => {
                        console.error("이미지 로드 실패 (Promise):", error);
                        // 콜백 방식으로 재시도
                        tryCallbackMethod(dataURL);
                    });
            } else {
                // Fabric.js v4 이하 방식 (콜백 기반)
                tryCallbackMethod(dataURL);
            }
        };

        reader.onerror = function (error) {
            console.error("파일 읽기 실패:", error);
            alert("파일을 읽을 수 없습니다.");
        };

        reader.readAsDataURL(file);
    }

    function tryCallbackMethod(dataURL) {
        fabric.Image.fromURL(
            dataURL,
            (img) => {
                if (img) {
                    console.log("이미지 생성 성공 (콜백)");
                    addImageToCanvas(img);
                } else {
                    console.error("이미지 생성 실패 (콜백)");
                    alert("이미지를 로드할 수 없습니다.");
                }
            },
            {
                crossOrigin: "anonymous",
            },
        );
    }

    function addImageToCanvas(img) {
        console.log("캔버스에 이미지 추가 시작");

        const maxW = canvasWidth * 0.6;
        const maxH = canvasHeight * 0.6;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);

        console.log("이미지 크기 조정:", {
            original: { width: img.width, height: img.height },
            max: { width: maxW, height: maxH },
            scale: scale,
        });

        img.set({
            left: 10,
            top: 50,
            scaleX: scale,
            scaleY: scale,
        });

        fabricCanvas.add(img);
        fabricCanvas.setActiveObject(img);
        fabricCanvas.requestRenderAll();

        console.log("이미지 추가 완료");

        // 입력 필드 초기화
        if (imgInput) {
            imgInput.value = "";
        }
    }

    function addText() {
        if (!customText.trim() || !fabricCanvas) return;
        const text = new fabric.Text(customText, {
            left: 20,
            top: 20,
            fontFamily,
            fontSize,
            fill: "black",
        });
        fabricCanvas.add(text);
        fabricCanvas.requestRenderAll();
        customText = "";
    }

    function deleteSelected() {
        const active = fabricCanvas.getActiveObject();
        if (active) {
            fabricCanvas.remove(active);
            fabricCanvas.requestRenderAll();
        }
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

    function applyFont() {
        const obj = fabricCanvas.getActiveObject();
        if (obj) {
            obj.set({ fontFamily, fontSize });
            obj.setCoords();
            fabricCanvas.renderAll();
        }
    }

    async function onPrint() {
        if (!fabricCanvas) return alert("먼저 캔버스를 생성하세요");
        if (mode === "usb") await printViaUSB(canvasEl, { density });
        else await printViaBLE(canvasEl, { density });
        alert("출력이 완료되었습니다.");
    }
</script>

<main class="p-6 space-y-6">
    <h1 class="text-2xl font-bold">Niimbot 라벨 프린터 웹 출력기</h1>

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
        <canvas
            bind:this={canvasEl}
            width={canvasWidth}
            height={canvasHeight}
            class="border block"
            style="image-rendering:pixelated;"
        ></canvas>
        <div class="space-y-4">
            <div class="flex items-center space-x-4">
                <input
                    bind:this={imgInput}
                    type="file"
                    accept="image/*"
                    on:change={handleImageUpload}
                    class="hidden"
                />
                <button
                    on:click={() => imgInput.click()}
                    class="px-3 py-1 bg-gray-200 rounded">이미지 삽입</button
                >
                <input
                    type="text"
                    bind:value={customText}
                    placeholder="텍스트 입력"
                    class="border px-2 py-1 w-64"
                />
                <button
                    on:click={addText}
                    class="px-3 py-1 bg-blue-600 text-white rounded"
                    >텍스트 추가</button
                >
            </div>
            <div class="flex items-center space-x-4">
                {#if fontError}
                    <span class="text-red-500">{fontError}</span>
                {/if}
                <select bind:value={fontFamily} class="border px-2 py-1">
                    {#each systemFonts as font}
                        <option value={font}>{font}</option>
                    {/each}
                </select>
                <input
                    type="number"
                    bind:value={fontSize}
                    min="8"
                    class="border px-2 py-1 w-20"
                />
                <button
                    on:click={applyFont}
                    class="px-3 py-1 bg-indigo-600 text-white rounded"
                    >폰트 적용</button
                >
            </div>
            <div class="flex items-center space-x-4">
                <label class="flex items-center space-x-2"
                    ><input type="radio" bind:group={mode} value="usb" /> USB</label
                >
                <label class="flex items-center space-x-2"
                    ><input type="radio" bind:group={mode} value="ble" /> Bluetooth</label
                >
                <label class="flex items-center space-x-2"
                    ><span>밀도:</span><input
                        type="range"
                        min="1"
                        max="5"
                        bind:value={density}
                        class="form-range"
                    /><span>{density}</span></label
                >
                <button
                    on:click={onPrint}
                    class="px-4 py-2 bg-green-600 text-white rounded"
                    >출력</button
                >
                <button
                    on:click={deleteSelected}
                    class="px-3 py-1 bg-red-500 text-white rounded">삭제</button
                >
                <button
                    on:click={alignCenter}
                    class="px-3 py-1 bg-gray-600 text-white rounded"
                    >정렬</button
                >
            </div>
        </div>
    {/if}
</main>

<style>
    canvas {
        max-width: 100%;
        height: auto;
        border: 1px solid #ccc;
    }
</style>
