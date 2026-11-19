// 真实图片云端 OCR 自测：调用 TextIn xParse，打印返回的 Markdown（即识别结果）。
// 用法： TEXTIN_APP_ID=xxx TEXTIN_SECRET_CODE=yyy node scripts/cloud-ocr-test.mjs [img1.jpg img2.jpg ...]
// 识别质量看 Markdown 表格是否准；准了，app 内 markdownToSlots 复用 Excel 解析逻辑即可得到正确课程表。
import { readFileSync, existsSync } from 'node:fs'

const APP_ID = process.env.TEXTIN_APP_ID
const SECRET = process.env.TEXTIN_SECRET_CODE
if (!APP_ID || !SECRET) {
  console.error('缺少环境变量 TEXTIN_APP_ID / TEXTIN_SECRET_CODE')
  process.exit(1)
}

const defaultImgs = [
  'C:/Users/28756/Documents/xwechat_files/wxid_yolv1tn947ud22_53ef/temp/RWTemp/2026-08/23b87aa0221d86f9d1ff5001644b6e85.jpg',
  'C:/Users/28756/Documents/xwechat_files/wxid_yolv1tn947ud22_53ef/temp/RWTemp/2026-08/16015fad99f070d8b2d13e645c7e2470.jpg',
]
const cliImgs = process.argv.slice(2)
const imgs = (cliImgs.length ? cliImgs : defaultImgs).filter((p) => existsSync(p))
if (imgs.length === 0) {
  console.error('没有可用的图片文件（默认两张已不存在，请用命令行参数传入图片路径）')
  process.exit(1)
}

for (const p of imgs) {
  console.log('\n================ ' + p.split('/').pop() + ' ================')
  const buf = readFileSync(p)
  const res = await fetch('https://api.textin.com/ai/service/v1/pdf_to_markdown?table_flavor=md', {
    method: 'POST',
    headers: {
      'x-ti-app-id': APP_ID,
      'x-ti-secret-code': SECRET,
      'Content-Type': 'application/octet-stream',
    },
    body: buf,
  })
  const json = await res.json().catch(() => null)
  if (!json) {
    console.log('HTTP', res.status, '返回非 JSON')
    continue
  }
  if (json?.code !== 0 && json?.code !== 200) {
    console.log('ERROR', json?.code, json?.message || json?.msg)
    continue
  }
  const r = json.result
  const md = typeof r === 'string' ? r : r?.markdown ?? r?.text ?? r?.content ?? r?.pages?.[0]?.markdown ?? ''
  console.log(md || '(空)')
}
