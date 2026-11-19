/**
 * 课程表图片预处理：自动检测表格区域、网格线，并裁剪。
 * 纯浏览器端 Canvas 实现，无需后端。
 */

export interface TableGrid {
  /** 表格左上角 x */
  x: number
  /** 表格左上角 y */
  y: number
  /** 表格宽度 */
  width: number
  /** 表格高度 */
  height: number
  /** 横向网格线 y 坐标（从上到下，含外边框） */
  rows: number[]
  /** 纵向网格线 x 坐标（从左到右，含外边框） */
  cols: number[]
}

interface LineCandidate {
  /** 直线起始坐标（水平线为 y，垂直线为 x） */
  pos: number
  /** 连续长度 */
  length: number
  /** 起点（水平线为 x0，垂直线为 y0） */
  start: number
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

/** 预处理图片以提高 OCR 识别率：放大、灰度、自适应二值化 */
export async function preprocessForOcr(file: File, targetMaxDim = 2000): Promise<Blob> {
  const img = await loadImage(file)
  const canvas = document.createElement('canvas')
  let w = img.naturalWidth
  let h = img.naturalHeight
  const scale = Math.max(1, targetMaxDim / Math.max(w, h))
  w = Math.round(w * scale)
  h = Math.round(h * scale)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  // 关闭平滑，保留边缘锐度（但放大倍数过大时先正常缩放再二值化更稳定）
  ctx.imageSmoothingEnabled = scale <= 2
  ctx.drawImage(img, 0, 0, w, h)

  const imageData = ctx.getImageData(0, 0, w, h)
  const gray = toGrayscale(imageData.data)
  const binary = adaptiveThreshold(gray, w, h, 25, 15)

  // 把二值化结果写回 canvas
  const outData = ctx.createImageData(w, h)
  for (let i = 0; i < binary.length; i++) {
    const v = binary[i]!
    outData.data[i * 4] = v
    outData.data[i * 4 + 1] = v
    outData.data[i * 4 + 2] = v
    outData.data[i * 4 + 3] = 255
  }
  ctx.putImageData(outData, 0, 0)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), file.type || 'image/jpeg', 0.92)
  })
}

function getCanvas(img: HTMLImageElement, maxDim = 1600): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  scale: number
} {
  const canvas = document.createElement('canvas')
  let w = img.naturalWidth
  let h = img.naturalHeight
  let scale = 1
  if (Math.max(w, h) > maxDim) {
    scale = maxDim / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  return { canvas, ctx, scale }
}

function toGrayscale(data: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(data.length / 4)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // ITU-R BT.709
    out[j] = Math.round(0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!)
  }
  return out
}

/** 自适应阈值：对每个像素，比较其与周围局部均值的差异 */
function adaptiveThreshold(
  gray: Uint8Array,
  width: number,
  height: number,
  blockSize = 15,
  c = 10,
): Uint8Array {
  const out = new Uint8Array(gray.length)
  const half = Math.floor(blockSize / 2)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let count = 0
      for (let dy = -half; dy <= half; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= height) continue
        for (let dx = -half; dx <= half; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= width) continue
          sum += gray[yy * width + xx]!
          count++
        }
      }
      const mean = sum / count
      const idx = y * width + x
      out[idx] = gray[idx]! < mean - c ? 0 : 255
    }
  }
  return out
}

function detectHorizontalLines(
  binary: Uint8Array,
  width: number,
  height: number,
  minLengthRatio = 0.25,
): LineCandidate[] {
  const minLength = Math.max(width * minLengthRatio, 40)
  const lines: LineCandidate[] = []
  for (let y = 0; y < height; y++) {
    let run = 0
    let runStart = 0
    let best = 0
    let bestStart = 0
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (binary[idx] === 0) {
        if (run === 0) runStart = x
        run++
      } else {
        if (run > best) {
          best = run
          bestStart = runStart
        }
        run = 0
      }
    }
    if (run > best) {
      best = run
      bestStart = runStart
    }
    if (best >= minLength) {
      lines.push({ pos: y, length: best, start: bestStart })
    }
  }
  return lines
}

function detectVerticalLines(
  binary: Uint8Array,
  width: number,
  height: number,
  minLengthRatio = 0.15,
): LineCandidate[] {
  const minLength = Math.max(height * minLengthRatio, 40)
  const lines: LineCandidate[] = []
  for (let x = 0; x < width; x++) {
    let run = 0
    let runStart = 0
    let best = 0
    let bestStart = 0
    for (let y = 0; y < height; y++) {
      const idx = y * width + x
      if (binary[idx] === 0) {
        if (run === 0) runStart = y
        run++
      } else {
        if (run > best) {
          best = run
          bestStart = runStart
        }
        run = 0
      }
    }
    if (run > best) {
      best = run
      bestStart = runStart
    }
    if (best >= minLength) {
      lines.push({ pos: x, length: best, start: bestStart })
    }
  }
  return lines
}

function groupNearbyPositions(positions: number[], tolerance: number): number[] {
  if (positions.length === 0) return []
  positions = [...positions].sort((a, b) => a - b)
  const groups: number[][] = []
  let current = [positions[0]!]
  for (let i = 1; i < positions.length; i++) {
    if (positions[i]! - current[current.length - 1]! <= tolerance) {
      current.push(positions[i]!)
    } else {
      groups.push(current)
      current = [positions[i]!]
    }
  }
  groups.push(current)
  return groups.map((g) => Math.round(g.reduce((a, b) => a + b, 0) / g.length))
}

/** 找最长的连续线段组，排除短噪声线 */
function findGridCluster(
  lines: LineCandidate[],
  minCount: number,
  tolerance: number,
): { positions: number[]; start: number; end: number } | null {
  if (lines.length < minCount) return null
  const grouped = groupNearbyPositions(
    lines.map((l) => l.pos),
    tolerance,
  )
  if (grouped.length < minCount) return null

  // 找连续密度最大的区间
  let bestStart = 0
  let bestEnd = 0
  let bestCount = 0
  for (let i = 0; i < grouped.length; i++) {
    let j = i
    while (j < grouped.length && grouped[j]! - grouped[i]! < 1000) j++
    const count = j - i
    if (count > bestCount) {
      bestCount = count
      bestStart = i
      bestEnd = j
    }
  }

  if (bestCount < minCount) return null
  const cluster = grouped.slice(bestStart, bestEnd)
  return {
    positions: cluster,
    start: cluster[0]!,
    end: cluster[cluster.length - 1]!,
  }
}

/** 检测图片中的课表网格。失败返回 null，调用方应使用文本坐标法兜底。 */
export async function detectTableGrid(file: File | Blob): Promise<TableGrid | null> {
  const img = await loadImage(file)
  const { canvas, ctx } = getCanvas(img, 1600)
  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)
  const gray = toGrayscale(imageData.data)
  const binary = adaptiveThreshold(gray, width, height, 21, 12)

  const hLines = detectHorizontalLines(binary, width, height)
  const vLines = detectVerticalLines(binary, width, height)

  const hCluster = findGridCluster(hLines, 4, 4)
  const vCluster = findGridCluster(vLines, 3, 4)

  if (!hCluster || !vCluster) return null

  // 裁剪到网格区域
  const x = Math.max(0, vCluster.start - 2)
  const y = Math.max(0, hCluster.start - 2)
  const w = Math.min(width, vCluster.end + 2) - x
  const h = Math.min(height, hCluster.end + 2) - y

  return {
    x,
    y,
    width: w,
    height: h,
    rows: hCluster.positions.map((p) => p - y),
    cols: vCluster.positions.map((p) => p - x),
  }
}

/** 将文件裁剪到指定矩形，返回新的 Blob */
export async function cropImageToRect(
  file: File | Blob,
  rect: { x: number; y: number; width: number; height: number },
): Promise<Blob> {
  const img = await loadImage(file)
  const { scale } = getCanvas(img, 2400)
  const x = Math.round(rect.x / scale)
  const y = Math.round(rect.y / scale)
  const w = Math.round(rect.width / scale)
  const h = Math.round(rect.height / scale)

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const outCtx = out.getContext('2d')!
  outCtx.drawImage(img, x, y, w, h, 0, 0, w, h)

  return new Promise((resolve) => {
    out.toBlob((blob) => resolve(blob!), file.type || 'image/jpeg', 0.92)
  })
}

/** 按网格线把文字块坐标映射到单元格 */
export function mapWordsToCells(
  words: { text: string; x0: number; y0: number; x1: number; y1: number }[],
  grid: TableGrid,
): { day: number; period: number; text: string }[] {
  if (grid.rows.length < 2 || grid.cols.length < 2) return []

  const rowMids = grid.rows.map((y, i) => {
    const prev = i === 0 ? y : grid.rows[i - 1]!
    const next = i === grid.rows.length - 1 ? y : grid.rows[i + 1]!
    return {
      y,
      y0: (prev + y) / 2,
      y1: (y + next) / 2,
      period: i, // 0 = 表头行，1..n = 第1..n节
    }
  })

  const colMids = grid.cols.map((x, i) => {
    const prev = i === 0 ? x : grid.cols[i - 1]!
    const next = i === grid.cols.length - 1 ? x : grid.cols[i + 1]!
    return {
      x,
      x0: (prev + x) / 2,
      x1: (x + next) / 2,
      day: i, // 0 = 节次列，1..n = 周一..n
    }
  })

  const cells: { day: number; period: number; text: string }[] = []

  for (const w of words) {
    const cy = (w.y0 + w.y1) / 2
    const cx = (w.x0 + w.x1) / 2
    const row = rowMids.find((r) => cy >= r.y0 && cy <= r.y1)
    const col = colMids.find((c) => cx >= c.x0 && cx <= c.x1)
    if (!row || !col) continue
    if (row.period === 0) continue // 表头
    if (col.day === 0) continue // 节次列
    cells.push({
      day: col.day,
      period: row.period,
      text: w.text,
    })
  }

  return cells
}
