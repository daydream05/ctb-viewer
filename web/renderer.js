function getCanvasContext(canvas) {
  return canvas.getContext("2d", { alpha: false, colorSpace: "srgb" });
}

function fitSize(sourceWidth, sourceHeight, maxWidth, maxHeight) {
  const sourceAspect = sourceWidth / sourceHeight;
  let width = Math.max(1, Math.floor(maxWidth));
  let height = Math.max(1, Math.floor(width / sourceAspect));

  if (height > maxHeight) {
    height = Math.max(1, Math.floor(maxHeight));
    width = Math.max(1, Math.floor(height * sourceAspect));
  }

  return { width, height };
}

export function clearCanvas(canvas, background = "#05070b") {
  const ctx = getCanvasContext(canvas);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width || 1, canvas.height || 1);
  ctx.restore();
}

export function renderPlaceholder(canvas, title, detail = "") {
  const bounds = canvas.parentElement?.getBoundingClientRect() ?? { width: 640, height: 420 };
  const cssWidth = Math.max(280, Math.floor(bounds.width));
  const cssHeight = Math.max(220, Math.floor(bounds.height));
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const ctx = getCanvasContext(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#05070b";
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const gradient = ctx.createLinearGradient(0, 0, cssWidth, cssHeight);
  gradient.addColorStop(0, "rgba(93, 245, 192, 0.14)");
  gradient.addColorStop(1, "rgba(96, 165, 250, 0.08)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
  ctx.strokeRect(16, 16, cssWidth - 32, cssHeight - 32);

  ctx.fillStyle = "rgba(248, 250, 252, 0.92)";
  ctx.font = "600 20px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, cssWidth / 2, cssHeight / 2 - 8);

  if (detail) {
    ctx.fillStyle = "rgba(148, 163, 184, 0.85)";
    ctx.font = "15px 'IBM Plex Mono', monospace";
    ctx.fillText(detail, cssWidth / 2, cssHeight / 2 + 22);
  }
}

export async function renderRgbaBuffer(
  canvas,
  pixels,
  width,
  height,
  { background = "#05070b", smoothing = false, maxHeight = 560 } = {},
) {
  const container = canvas.parentElement?.getBoundingClientRect() ?? { width: width, height: maxHeight };
  const cssSize = fitSize(width, height, container.width, maxHeight);
  const dpr = window.devicePixelRatio || 1;
  const ctx = getCanvasContext(canvas);

  canvas.width = Math.max(1, Math.floor(cssSize.width * dpr));
  canvas.height = Math.max(1, Math.floor(cssSize.height * dpr));
  canvas.style.width = `${cssSize.width}px`;
  canvas.style.height = `${cssSize.height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, cssSize.width, cssSize.height);
  ctx.imageSmoothingEnabled = smoothing;

  const rgba = pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels);
  const imageData = new ImageData(rgba, width, height);

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(imageData);
    try {
      ctx.drawImage(bitmap, 0, 0, cssSize.width, cssSize.height);
    } finally {
      bitmap.close?.();
    }
    return;
  }

  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  offscreen.getContext("2d", { alpha: false }).putImageData(imageData, 0, 0);
  ctx.drawImage(offscreen, 0, 0, cssSize.width, cssSize.height);
}
