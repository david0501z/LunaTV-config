// LunaTV 配置订阅服务 — 仅处理 GitHub JSON 订阅
export default {
  async fetch(request, env, ctx) {
    if (env && env.KV && typeof globalThis.KV === 'undefined') {
      globalThis.KV = env.KV
    }
    return handleRequest(request)
  }
}

// ---------- 常量 ----------
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// JSON 源映射（GitHub raw）
const JSON_SOURCES = {
  'jin18': 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jin18.json',
  'jingjian': 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jingjian.json',
  'full': 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/LunaTV-config.json'
}

// 格式配置：proxy=加代理前缀, base58=Base58 编码
const FORMAT_CONFIG = {
  '0': { proxy: false, base58: false },
  'raw': { proxy: false, base58: false },
  '1': { proxy: true, base58: false },
  'proxy': { proxy: true, base58: false },
  '2': { proxy: false, base58: true },
  'base58': { proxy: false, base58: true },
  '3': { proxy: true, base58: true },
  'proxy-base58': { proxy: true, base58: true }
}

// ---------- Base58 编码 ----------
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58Encode(obj) {
  const str = JSON.stringify(obj)
  const bytes = new TextEncoder().encode(str)
  let intVal = 0n
  for (let b of bytes) intVal = (intVal << 8n) + BigInt(b)
  let result = ''
  while (intVal > 0n) {
    const mod = intVal % 58n
    result = BASE58_ALPHABET[Number(mod)] + result
    intVal = intVal / 58n
  }
  for (let b of bytes) {
    if (b === 0) result = BASE58_ALPHABET[0] + result
    else break
  }
  return result
}

// ---------- API 字段前缀替换 ----------
function addOrReplacePrefix(obj, newPrefix) {
  if (typeof obj !== 'object' || obj === null) return obj
  if (Array.isArray(obj)) return obj.map(item => addOrReplacePrefix(item, newPrefix))
  const newObj = {}
  for (const key in obj) {
    if (key === 'api' && typeof obj[key] === 'string') {
      let apiUrl = obj[key]
      const urlIndex = apiUrl.indexOf('?url=')
      if (urlIndex !== -1) apiUrl = apiUrl.slice(urlIndex + 5)
      if (!apiUrl.startsWith(newPrefix)) apiUrl = newPrefix + apiUrl
      newObj[key] = apiUrl
    } else {
      newObj[key] = addOrReplacePrefix(obj[key], newPrefix)
    }
  }
  return newObj
}

// ---------- KV 缓存 ----------
async function getCachedJSON(url) {
  const kvAvailable = typeof KV !== 'undefined' && KV && typeof KV.get === 'function'
  if (kvAvailable) {
    const cacheKey = 'CACHE_' + url
    const cached = await KV.get(cacheKey)
    if (cached) {
      try { return JSON.parse(cached) } catch { await KV.delete(cacheKey) }
    }
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    const data = await res.json()
    await KV.put(cacheKey, JSON.stringify(data), { expirationTtl: 1800 })
    return data
  } else {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    return await res.json()
  }
}

// ---------- 错误日志 ----------
async function logError(type, info) {
  console.error('[ERROR]', type, info)
}

// ---------- 主路由 ----------
async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const reqUrl = new URL(request.url)
  const pathname = reqUrl.pathname
  const formatParam = reqUrl.searchParams.get('format')
  const prefixParam = reqUrl.searchParams.get('prefix')
  const sourceParam = reqUrl.searchParams.get('source')
  const currentOrigin = reqUrl.origin

  // 健康检查
  if (pathname === '/health') {
    return new Response('OK', { status: 200, headers: CORS_HEADERS })
  }

  // JSON 订阅格式输出
  if (formatParam !== null) {
    return handleFormatRequest(formatParam, sourceParam, prefixParam, currentOrigin)
  }

  // 默认返回首页
  return handleHomePage(currentOrigin)
}

// ---------- JSON 订阅处理 ----------
async function handleFormatRequest(formatParam, sourceParam, prefixParam, currentOrigin) {
  try {
    const config = FORMAT_CONFIG[formatParam]
    if (!config) {
      return errorResponse('Invalid format parameter', { format: formatParam }, 400)
    }

    const selectedSource = JSON_SOURCES[sourceParam] || JSON_SOURCES['full']
    const data = await getCachedJSON(selectedSource)

    const defaultPrefix = currentOrigin + '/?url='
    const newData = config.proxy
      ? addOrReplacePrefix(data, prefixParam || defaultPrefix)
      : data

    if (config.base58) {
      const encoded = base58Encode(newData)
      return new Response(encoded, {
        headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...CORS_HEADERS }
      })
    } else {
      return new Response(JSON.stringify(newData), {
        headers: { 'Content-Type': 'application/json;charset=UTF-8', ...CORS_HEADERS }
      })
    }
  } catch (err) {
    await logError('json', { message: err.message })
    return errorResponse(err.message, {}, 500)
  }
}

// ---------- 首页文档 ----------
async function handleHomePage(currentOrigin) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LunaTV 配置订阅</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; line-height: 1.6; }
    h1 { color: #333; } h2 { color: #555; margin-top: 30px; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 14px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    .section { background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    table td { padding: 8px; border: 1px solid #ddd; }
    table td:first-child { background: #f5f5f5; font-weight: bold; width: 30%; }
  </style>
</head>
<body>
  <h1>📺 LunaTV 配置订阅服务</h1>
  <p>从 GitHub 读取 LunaTV 配置文件，支持多种格式输出和代理前缀注入。</p>

  <h2>参数说明</h2>
  <div class="section">
    <table>
      <tr><td>format</td><td><code>0</code> 或 <code>raw</code> = 原始 JSON<br><code>1</code> 或 <code>proxy</code> = 添加代理前缀<br><code>2</code> 或 <code>base58</code> = Base58 编码<br><code>3</code> 或 <code>proxy-base58</code> = 代理前缀 + Base58 编码</td></tr>
      <tr><td>source</td><td><code>jin18</code> = 精简版<br><code>jingjian</code> = 精简版+成人<br><code>full</code> = 完整版（默认）</td></tr>
      <tr><td>prefix</td><td>自定义代理前缀（format=1 或 3 时生效）</td></tr>
    </table>
  </div>

  <h2>订阅链接示例</h2>
  <div class="section">
    <h3>📦 精简版（jin18）</h3>
    <p>原始 JSON：<code>${currentOrigin}?format=0&source=jin18</code></p>
    <p>代理 JSON：<code>${currentOrigin}?format=1&source=jin18</code></p>
    <p>Base58：<code>${currentOrigin}?format=2&source=jin18</code></p>
    <p>代理+Base58：<code>${currentOrigin}?format=3&source=jin18</code></p>
  </div>
  <div class="section">
    <h3>📦 完整版（full，默认）</h3>
    <p>原始 JSON：<code>${currentOrigin}?format=0&source=full</code></p>
    <p>代理 JSON：<code>${currentOrigin}?format=1&source=full</code></p>
    <p>Base58：<code>${currentOrigin}?format=2&source=full</code></p>
    <p>代理+Base58：<code>${currentOrigin}?format=3&source=full</code></p>
  </div>
</body>
</html>`

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS }
  })
}

// ---------- 错误响应 ----------
function errorResponse(error, data = {}, status = 400) {
  return new Response(JSON.stringify({ error, ...data }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
  })
}
