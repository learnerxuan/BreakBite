/** QR Model 2, fixed version 5-L, byte mode, mask 0. No remote QR service or credential URL. */
export function qrMatrix(text: string): boolean[][] {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > 106) throw new Error('Pickup credential is too long for this QR format.');
    const bits: number[] = [];
    const append = (value: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
    append(4, 4); append(bytes.length, 8); for (const b of bytes) append(b, 8);
    for (let i = 0, n = Math.min(4, 864 - bits.length); i < n; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const data: number[] = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((n, b) => (n << 1) | b, 0));
    for (let pad = 0; data.length < 108; pad++) data.push(pad % 2 ? 0x11 : 0xec);
    const mul = (a: number, b: number): number => { let v = 0; for (; b; b >>>= 1) { if (b & 1) v ^= a; a <<= 1; if (a & 0x100) a ^= 0x11d; } return v; };
    // A single RS block: 108 data + 26 error-correction codewords for version 5-L.
    let generator = [1]; let root = 1;
    for (let i = 0; i < 26; i++) {
        const next = new Array<number>(generator.length + 1).fill(0);
        generator.forEach((c, j) => { next[j] = next[j]! ^ c; next[j + 1] = next[j + 1]! ^ mul(c, root); });
        generator = next; root = mul(root, 2);
    }
    const work = [...data, ...new Array<number>(26).fill(0)];
    for (let i = 0; i < data.length; i++) { const lead = work[i]!; if (lead) for (let j = 0; j < generator.length; j++) work[i + j] = work[i + j]! ^ mul(generator[j]!, lead); }
    const codewords = [...data, ...work.slice(108)]; const size = 37;
    const m: (boolean | null)[][] = Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));
    const set = (r: number, c: number, v: boolean) => { if (r >= 0 && c >= 0 && r < size && c < size) m[r]![c] = v; };
    for (const [r, c] of [[0, 0], [0, 30], [30, 0]] as const) for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) set(r + y, c + x, y >= 0 && y < 7 && x >= 0 && x < 7 && (y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4)));
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) set(30 + y, 30 + x, Math.max(Math.abs(y), Math.abs(x)) !== 1);
    for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    // Format: ECC L=01, mask=000, BCH(15,5), XOR mask 0x5412.
    let format = 8 << 10; for (let i = 14; i >= 10; i--) if ((format >>> i) & 1) format ^= 0x537 << (i - 10);
    format = ((8 << 10) | format) ^ 0x5412;
    for (let i = 0; i < 15; i++) {
        const bit = ((format >>> i) & 1) !== 0;
        set(i < 6 ? i : i < 8 ? i + 1 : size - 15 + i, 8, bit);
        set(8, i < 8 ? size - i - 1 : i < 9 ? 15 - i : 15 - i - 1, bit);
    }
    set(size - 8, 8, true);
    let index = 0; let up = true;
    for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        for (let step = 0; step < size; step++) {
            const row = up ? size - 1 - step : step;
            for (let x = 0; x < 2; x++) {
                const c = col - x; if (m[row]![c] !== null) continue;
                const bit = index < codewords.length * 8 ? ((codewords[index >>> 3]! >>> (7 - (index & 7))) & 1) !== 0 : false;
                set(row, c, bit !== ((row + c) % 2 === 0)); index++;
            }
        }
        up = !up;
    }
    return m as boolean[][];
}
export function qrSvg(payload: string): string {
    const matrix = qrMatrix(payload); const edge = matrix.length + 8;
    let path = '';
    matrix.forEach((row, y) => row.forEach((v, x) => { if (v) path += `M${x + 4},${y + 4}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${edge} ${edge}" role="img" aria-label="One-time pickup QR code" shape-rendering="crispEdges"><path fill="white" d="M0,0h${edge}v${edge}H0z"/><path fill="black" d="${path}"/></svg>`;
}
