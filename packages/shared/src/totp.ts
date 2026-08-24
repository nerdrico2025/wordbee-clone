import { authenticator } from "otplib";
import QRCode from "qrcode";

authenticator.options = { window: 1 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function verifyTotpToken(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

export async function generateTotpQrCodeDataUrl(
  secret: string,
  accountLabel: string,
  issuer = "Wordbee Clone"
): Promise<string> {
  const otpauthUrl = authenticator.keyuri(accountLabel, issuer, secret);
  return QRCode.toDataURL(otpauthUrl);
}
