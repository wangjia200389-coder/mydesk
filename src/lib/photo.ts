/**
 * 物品照片存储：使用 IndexedDB（而非 localStorage），
 * 避免大量/大尺寸 Base64 把 localStorage 撑爆（localStorage 通常只有 5MB 配额）。
 * 元数据（物品信息、标签等）仍走 Zustand + localStorage，照片仅存 IndexedDB，
 * 物品数据里只保留 photoId 引用。
 */

const DB_NAME = 'mydesk-photos'
const STORE = 'photos'
const DB_VERSION = 1

export interface PhotoRecord {
  id: string
  dataUrl: string
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

/** 保存一个照片（dataUrl），返回自动生成的 id */
export async function savePhoto(dataUrl: string): Promise<string> {
  const db = await openDB()
  const id = `ph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ id, dataUrl } satisfies PhotoRecord)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  return id
}

/** 取回照片 dataUrl，不存在返回 null */
export async function getPhoto(id: string): Promise<string | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => {
      const rec = req.result as PhotoRecord | undefined
      resolve(rec ? rec.dataUrl : null)
    }
    req.onerror = () => reject(req.error)
  })
}

/** 删除照片（物品被删除时调用） */
export async function deletePhoto(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 列出所有照片记录（数据备份用） */
export async function getAllPhotos(): Promise<PhotoRecord[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve((req.result as PhotoRecord[]) ?? [])
    req.onerror = () => reject(req.error)
  })
}

/** 只列出照片 id（同步时算指纹用，不读取 7MB 内容） */
export async function listPhotoIds(): Promise<string[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAllKeys()
    req.onsuccess = () => resolve((req.result ?? []).map(String))
    req.onerror = () => reject(req.error)
  })
}

/** 写入一条照片记录（恢复备份用），同 id 覆盖 */
export async function putPhotoRecord(rec: PhotoRecord): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(rec)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * 把上传的图片文件压缩为 JPEG dataUrl：
 * - 等比缩放到最长边 maxSide（默认 800px）
 * - 质量 quality（默认 0.7）
 * 既节省存储，也提升列表渲染性能。
 */
export function compressImageFile(
  file: File,
  maxSide = 800,
  quality = 0.7,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('图片解码失败'))
      img.onload = () => {
        const ratio = Math.min(1, maxSide / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * ratio))
        const h = Math.max(1, Math.round(img.height * ratio))
        try {
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('无法创建画布'))
            return
          }
          ctx.drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch (e) {
          reject(e instanceof Error ? e : new Error('图片压缩失败'))
        }
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
