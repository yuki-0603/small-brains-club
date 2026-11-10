'use strict';
// The 10K policy is small enough to run without downloading the WASM runtime.
window.TinyPolicy = class TinyPolicy {
  static async load(info) {
    const response = await fetch(info.url);
    if (!response.ok) throw Error('クラゲを読み込めませんでした。');
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== info.bytes) throw Error('クラゲのデータが不足しています。');
    const values = new Float32Array(buffer);
    const network = new TinyPolicy();
    network.layers = info.layers.map(layer => ({...layer,
      weights: values.subarray(layer.weight_offset, layer.weight_offset + layer.inputs * layer.outputs),
      biases: values.subarray(layer.bias_offset, layer.bias_offset + layer.outputs)}));
    return network;
  }
  infer(features) {
    let values = features;
    for (const [index, layer] of this.layers.entries()) {
      const output = new Float32Array(layer.outputs);
      for (let row = 0; row < layer.outputs; row++) {
        let total = layer.biases[row];
        for (let col = 0; col < layer.inputs; col++) total += layer.weights[row * layer.inputs + col] * values[col];
        output[row] = index < this.layers.length - 1 ? Math.max(0, total) : total;
      }
      values = output;
    }
    return values;
  }
};
