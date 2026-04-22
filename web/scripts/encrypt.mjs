/**
 * Encrypt src/questions.json -> public/data.enc
 *
 * Usage:
 *   QUIZ_PASSWORD="your-secret" npm run encrypt
 *   (or run without env var; it will prompt)
 *
 * Format (binary):
 *   magic(4: "SQZ1") | iterations(uint32 BE) | salt(16) | iv(12) | ciphertext(..)
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto as crypto } from "node:crypto";
import readline from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../src/questions.json");
const OUT = resolve(__dirname, "../public/data.enc");
const ITERATIONS = 250_000;

async function getPassword() {
    if (process.env.QUIZ_PASSWORD) return process.env.QUIZ_PASSWORD;
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    // Hide input
    const origWrite = rl._writeToOutput?.bind(rl);
    rl.stdoutMuted = false;
    rl._writeToOutput = (s) => {
        if (rl.stdoutMuted) {
            process.stdout.write("*");
        } else if (origWrite) {
            origWrite(s);
        } else {
            process.stdout.write(s);
        }
    };
    const ask = (q) =>
        new Promise((res) => {
            rl.question(q, (a) => res(a));
        });
    process.stdout.write("輸入加密密碼: ");
    rl.stdoutMuted = true;
    const pw = await ask("");
    rl.stdoutMuted = false;
    process.stdout.write("\n再次輸入確認: ");
    rl.stdoutMuted = true;
    const pw2 = await ask("");
    rl.stdoutMuted = false;
    process.stdout.write("\n");
    rl.close();
    if (pw !== pw2) {
        console.error("兩次密碼不一致");
        process.exit(1);
    }
    if (!pw) {
        console.error("密碼不可為空");
        process.exit(1);
    }
    return pw;
}

async function deriveKey(password, salt) {
    const baseKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function main() {
    const pw = await getPassword();
    const plaintext = await readFile(SRC);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pw, salt);
    const ctBuf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        plaintext
    );
    const ct = new Uint8Array(ctBuf);

    const magic = new TextEncoder().encode("SQZ1");
    const iters = new Uint8Array(4);
    new DataView(iters.buffer).setUint32(0, ITERATIONS, false);

    const out = new Uint8Array(magic.length + 4 + salt.length + iv.length + ct.length);
    let p = 0;
    out.set(magic, p); p += magic.length;
    out.set(iters, p); p += 4;
    out.set(salt, p); p += salt.length;
    out.set(iv, p); p += iv.length;
    out.set(ct, p);

    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, out);
    console.log(`✅ 加密完成: ${OUT}`);
    console.log(`   原始: ${plaintext.length.toLocaleString()} bytes`);
    console.log(`   加密: ${out.length.toLocaleString()} bytes`);
    console.log(`   迭代次數: ${ITERATIONS.toLocaleString()}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
