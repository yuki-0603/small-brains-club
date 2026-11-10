'use strict';
// A single persistent WASM runtime. Only one native model session may be alive.
let manifestPromise, runtimeStarted = false, active = null, queue = Promise.resolve();
let created = 0, released = 0;
const packedCache = new Map();
const config = () => manifestPromise ||= fetch('models.json').then(r => {
  if (!r.ok) throw Error('モデル一覧を取得できませんでした。');
  return r.json();
});
function progress(id, key, stage) { postMessage({id, progress: {key, stage}}); }
async function sha256(bytes) {
  if (!self.crypto?.subtle) return null; // Local LAN preview is HTTP; releases use HTTPS.
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
}
async function fetchPack(key, id) {
  if (packedCache.has(key)) return packedCache.get(key);
  const info = (await config()).models[key];
  if (!info || key === '10k') throw Error('この相手のデータが見つかりません。');
  progress(id, key, 'downloading');
  const metaResponse = await fetch(info.metadata);
  if (!metaResponse.ok) throw Error('相手の情報を取得できませんでした。');
  const meta = await metaResponse.json();
  if (meta.format !== 'othello-weight-pack-v1' || meta.bits !== 8 || meta.blob_bytes !== info.blob_bytes || meta.onnx_bytes !== info.expanded_bytes || meta.blob_sha256 !== info.sha256 || meta.expanded_onnx_sha256 !== info.expanded_sha256) throw Error('相手のデータ形式が一致しません。');
  const response = await fetch(info.url);
  if (!response.ok) throw Error('相手を読み込めませんでした。もう一度お試しください。');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== info.blob_bytes) throw Error('相手のデータが不足しています。');
  const hash = await sha256(bytes);
  if (hash && hash !== info.sha256) throw Error('相手のデータを確認できませんでした。');
  // Keep at most two compact models; never cache expanded FP32 models.
  while (packedCache.size >= 2) packedCache.delete(packedCache.keys().next().value);
  const value = {bytes, meta}; packedCache.set(key, value);
  return value;
}
function decode({bytes: packed, meta}) {
  const bytes = new Uint8Array(meta.onnx_bytes), view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
  const target = new DataView(bytes.buffer);
  for (const fragment of meta.fragments) {
    const text = atob(fragment.base64);
    for (let i = 0; i < text.length; i++) bytes[fragment.offset + i] = text.charCodeAt(i);
  }
  for (const weight of meta.weights) {
    if (weight.quant_bytes !== weight.count || weight.offset + 4 * weight.count > bytes.length || weight.quant_offset + weight.count > packed.length || weight.scale_offset + weight.scale_count * 4 > packed.length) throw Error('重みの形式が正しくありません。');
    for (let i = 0; i < weight.count; i++) {
      const row = Math.floor(i / weight.row_length), col = i % weight.row_length;
      const scaleIndex = row * weight.groups_per_row + Math.floor(col / meta.group_size);
      const scale = view.getFloat32(weight.scale_offset + 4 * scaleIndex, true);
      target.setFloat32(weight.offset + i * 4, view.getInt8(weight.quant_offset + i) * scale, true);
    }
  }
  return bytes;
}
async function load(key, id) {
  if (active?.key === key) return active.session;
  let pack = await fetchPack(key, id);
  // Release first, then decode, to keep peak memory bounded during switches.
  if (active) { await active.session.release(); active = null; released++; }
  progress(id, key, 'initializing');
  if (!runtimeStarted) {
    importScripts('vendor/ort.wasm.min.js');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = new URL('vendor/', self.location.href).href;
    ort.env.logLevel = 'error'; runtimeStarted = true;
  }
  let bytes = decode(pack);
  const hash = await sha256(bytes), expected = pack.meta.expanded_onnx_sha256;
  if (hash && hash !== expected) throw Error('復元した相手のデータが一致しません。');
  packedCache.delete(key); pack = null;
  const session = await ort.InferenceSession.create(bytes, {executionProviders: ['wasm'], graphOptimizationLevel: 'all'});
  bytes = null; created++; active = {key, session};
  progress(id, key, 'ready');
  return session;
}
async function run({id, type, payload = {}}) {
  const key = payload.model;
  try {
    let result;
    if (type === 'prefetch') {
      if (active?.key !== key) await fetchPack(key, id);
      result = {model: key, downloaded: true};
    } else if (type === 'prepare') {
      await load(key, id); result = {model: key, ready: true};
    } else if (type === 'infer') {
      const session = await load(key, id);
      if (!Array.isArray(payload.features) || payload.features.length !== 128 || payload.features.some(v => v !== 0 && v !== 1)) throw Error('盤面の形式が正しくありません。');
      const input = new ort.Tensor('float32', Float32Array.from(payload.features), [1, 128]);
      let output;
      try {
        output = await session.run({features: input});
        const logits = Array.from(output.logits.data);
        if (logits.length !== 64 || logits.some(v => !Number.isFinite(v))) throw Error('相手の着手を計算できませんでした。');
        result = {logits};
      } finally { input.dispose(); output?.logits.dispose(); }
    } else if (type === 'diagnostics') {
      result = {created, released, resident: active ? 1 : 0, active: active?.key || null, runtimeStarted,
        hashVerification: !!self.crypto?.subtle, compactCachedModels: [...packedCache.keys()]};
    } else throw Error('未対応の操作です。');
    postMessage({id, result});
  } catch (error) { postMessage({id, error: error.message || String(error)}); }
}
onmessage = ({data}) => { queue = queue.then(() => run(data)); };
