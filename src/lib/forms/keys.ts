const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** 22 char base62 public form key (~131 bits). Rejection sampling avoids modulo bias. */
export function newFormKey(len = 22): string {
  let out = "";
  while (out.length < len) {
    const b = new Uint8Array(len * 2);
    crypto.getRandomValues(b);
    for (const x of b) {
      if (x < 248 && out.length < len) out += ALPHABET[x % 62];
    }
  }
  return out;
}

export const isFormKey = (k: string) => /^[0-9A-Za-z]{22}$/.test(k);
