import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError, requireThat } from './errors.js';

export interface MediaStore {
    put(filename: string, bytes: Buffer): Promise<void>;
    get(filename: string): Promise<Buffer>;
}
const valid = (filename: string) => requireThat(/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(filename), 'INVALID_PHOTO', 'Invalid photo name.');
export function mediaType(filename: string): string {
    return filename.endsWith('.png') ? 'image/png' : filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
}
export function fileMedia(directory: string): MediaStore {
    return {
        async put(filename, bytes) { valid(filename); await mkdir(path.join(directory, 'media'), { recursive: true }); await writeFile(path.join(directory, 'media', filename), bytes, { mode: 0o600 }); },
        async get(filename) { valid(filename); return readFile(path.join(directory, 'media', filename)).catch(() => { throw new AppError(404, 'NOT_FOUND', 'Photo not found.'); }); },
    };
}
/** Content-addressed raster images only. No browser-supplied URLs or Blob tokens. */
export function blobMedia(root: string, token: string | undefined): MediaStore {
    const key = (filename: string) => { valid(filename); requireThat(token, 'PHOTO_NOT_CONFIGURED', 'Connect a private Vercel Blob store to enable kitchen photo uploads.', 503); return `breakbite/${root}/${filename}`; };
    return {
        async put(filename, bytes) {
            const pathname = key(filename);
            const { put } = await import('@vercel/blob');
            // Identical hash means identical bytes, including simultaneous uploads.
            await put(pathname, bytes, { access: 'private', token, addRandomSuffix: false, allowOverwrite: true, contentType: mediaType(filename) });
        },
        async get(filename) {
            const pathname = key(filename);
            const { get } = await import('@vercel/blob');
            const result = await get(pathname, { access: 'private', token });
            if (!result || result.statusCode !== 200 || !result.stream) throw new AppError(404, 'NOT_FOUND', 'Photo not found.');
            requireThat(result.blob.size !== null && result.blob.size <= 2 * 1024 * 1024, 'PHOTO_SIZE', 'Invalid photo size.', 502);
            return Buffer.from(await new Response(result.stream).arrayBuffer());
        },
    };
}
