/**
 * Zhang-Suen Thinning Algorithm for Skeletonization
 */
export const skeletonize = (data: Uint8Array, width: number, height: number): Uint8Array => {
  const output = new Uint8Array(data);
  let changed = true;

  const getPixel = (x: number, y: number, arr: Uint8Array) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return arr[y * width + x] > 0 ? 1 : 0;
  };

  while (changed) {
    changed = false;
    const toRemove: number[] = [];

    // Step 1
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (output[idx] === 0) continue;

        const p2 = getPixel(x, y - 1, output);
        const p3 = getPixel(x + 1, y - 1, output);
        const p4 = getPixel(x + 1, y, output);
        const p5 = getPixel(x + 1, y + 1, output);
        const p6 = getPixel(x, y + 1, output);
        const p7 = getPixel(x - 1, y + 1, output);
        const p8 = getPixel(x - 1, y, output);
        const p9 = getPixel(x - 1, y - 1, output);

        const a = (p2 === 0 && p3 === 1 ? 1 : 0) +
                  (p3 === 0 && p4 === 1 ? 1 : 0) +
                  (p4 === 0 && p5 === 1 ? 1 : 0) +
                  (p5 === 0 && p6 === 1 ? 1 : 0) +
                  (p6 === 0 && p7 === 1 ? 1 : 0) +
                  (p7 === 0 && p8 === 1 ? 1 : 0) +
                  (p8 === 0 && p9 === 1 ? 1 : 0) +
                  (p9 === 0 && p2 === 1 ? 1 : 0);

        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;

        if (b >= 2 && b <= 6 && a === 1 && (p2 * p4 * p6 === 0) && (p4 * p6 * p8 === 0)) {
          toRemove.push(idx);
          changed = true;
        }
      }
    }
    for (const idx of toRemove) output[idx] = 0;
    toRemove.length = 0;

    // Step 2
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (output[idx] === 0) continue;

        const p2 = getPixel(x, y - 1, output);
        const p3 = getPixel(x + 1, y - 1, output);
        const p4 = getPixel(x + 1, y, output);
        const p5 = getPixel(x + 1, y + 1, output);
        const p6 = getPixel(x, y + 1, output);
        const p7 = getPixel(x - 1, y + 1, output);
        const p8 = getPixel(x - 1, y, output);
        const p9 = getPixel(x - 1, y - 1, output);

        const a = (p2 === 0 && p3 === 1 ? 1 : 0) +
                  (p3 === 0 && p4 === 1 ? 1 : 0) +
                  (p4 === 0 && p5 === 1 ? 1 : 0) +
                  (p5 === 0 && p6 === 1 ? 1 : 0) +
                  (p6 === 0 && p7 === 1 ? 1 : 0) +
                  (p7 === 0 && p8 === 1 ? 1 : 0) +
                  (p8 === 0 && p9 === 1 ? 1 : 0) +
                  (p9 === 0 && p2 === 1 ? 1 : 0);

        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;

        if (b >= 2 && b <= 6 && a === 1 && (p2 * p4 * p8 === 0) && (p2 * p6 * p8 === 0)) {
          toRemove.push(idx);
          changed = true;
        }
      }
    }
    for (const idx of toRemove) output[idx] = 0;
  }

  return output;
};
