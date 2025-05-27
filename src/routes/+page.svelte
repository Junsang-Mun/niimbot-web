<script>
    import { onMount, tick } from "svelte";
    import * as fabric from "fabric";

    let canvasEl;
    let fabricCanvas;
    let labelWidth = 60;
    let labelHeight = 30;
    let pxPerMm = 8;
    let canvasWidth = 0;
    let canvasHeight = 0;
    let customText = "";
    let initialized = false;

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
            fontSize: 20,
            fill: "black",
        });
        fabricCanvas.add(text);
    }

    async function addText() {
        if (!customText.trim()) return;
        const text = new fabric.Text(customText, {
            left: 20,
            top: 20,
            fontSize: 20,
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
                const maxWidth = canvasWidth * 0.6;
                const maxHeight = canvasHeight * 0.6;

                let scale = Math.min(
                    maxWidth / img.width,
                    maxHeight / img.height,
                    1,
                );

                img.set({
                    left: 10,
                    top: 50,
                    scaleX: scale,
                    scaleY: scale,
                });

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
        if (active) {
            const bounds = active.getBoundingRect(true);
            const centerX =
                (canvasWidth - bounds.width) / 2 - bounds.left + active.left;
            const centerY =
                (canvasHeight - bounds.height) / 2 - bounds.top + active.top;

            active.set({
                left: centerX,
                top: centerY,
            });

            active.setCoords();
            fabricCanvas.requestRenderAll();
        }
        active.setCoords();
        fabricCanvas.requestRenderAll();
        fabricCanvas.renderAll();
    }
</script>

<main class="p-6 space-y-4">
    <h1 class="text-2xl font-bold">🧾 Niimbot 라벨 에디터 (Fabric.js)</h1>

    {#if !initialized}
        <div class="flex flex-wrap items-center gap-4">
            <label>
                가로(mm):
                <input
                    type="number"
                    min="10"
                    bind:value={labelWidth}
                    class="border px-2 w-20"
                />
            </label>

            <label>
                세로(mm):
                <input
                    type="number"
                    min="10"
                    bind:value={labelHeight}
                    class="border px-2 w-20"
                />
            </label>

            <button
                class="px-4 py-1 bg-green-600 text-white rounded"
                on:click={initCanvas}
            >
                캔버스 생성
            </button>
        </div>
    {:else}
        <div>
            <label class="block font-medium">이미지 추가:</label>
            <label
                class="inline-block px-4 py-2 bg-gray-100 border border-gray-300 rounded cursor-pointer hover:bg-gray-200 text-sm font-medium"
            >
                이미지 선택
                <input
                    type="file"
                    accept="image/*"
                    on:change={handleImageUpload}
                    class="hidden"
                />
            </label>
        </div>

        <div class="space-y-2">
            <label class="block font-medium">텍스트 추가:</label>
            <input
                type="text"
                bind:value={customText}
                placeholder="텍스트 입력"
                class="border px-2 py-1 w-full max-w-md"
            />
            <button
                class="px-4 py-1 bg-blue-600 text-white rounded"
                on:click={addText}
            >
                텍스트 추가
            </button>
        </div>

        <div class="flex gap-2">
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
            class="border border-gray-400"
            style="image-rendering: pixelated; display: block;"
        ></canvas>
    {/if}
</main>

<style>
    canvas {
        max-width: 100%;
        height: auto;
    }
</style>
