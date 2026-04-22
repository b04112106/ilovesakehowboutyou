// Browser-side decrypt for data.enc produced by scripts/encrypt.mjs.

const MAGIC = "SQZ1";

async function deriveKey(password, salt, iterations) {
    const baseKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
    );
}

/**
 * @param {ArrayBuffer} buf  encrypted blob
 * @param {string} password
 * @returns {Promise<any>}   decoded JSON content
 * @throws on wrong password or corrupted data
 */
export async function decryptBlob(buf, password) {
    const u8 = new Uint8Array(buf);
    const magic = new TextDecoder().decode(u8.slice(0, 4));
    if (magic !== MAGIC) throw new Error("檔案格式錯誤");
    const iterations = new DataView(u8.buffer, u8.byteOffset + 4, 4).getUint32(
        0,
        false
    );
    const salt = u8.slice(8, 24);
    const iv = u8.slice(24, 36);
    const ct = u8.slice(36);
    const key = await deriveKey(password, salt, iterations);
    let plain;
    try {
        plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    } catch {
        throw new Error("密碼錯誤");
    }
    const text = new TextDecoder().decode(plain);
    return JSON.parse(text);
}
