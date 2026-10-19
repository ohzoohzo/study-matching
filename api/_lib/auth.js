// 구글 로그인(GIS)이 준 ID 토큰(credential)을 서버에서 확인해요.
// 클라이언트 ID(공개값)만 쓰고 클라이언트 시크릿은 쓰지 않아요.
// google-auth-library가 구글 공개키로 서명·만료·발급자를 보고, audience가 이 사이트의 클라이언트 ID인지 확인해요.
import { OAuth2Client } from "google-auth-library";

export const GOOGLE_CLIENT_ID = "27926126873-q4o4mr6s0bk5rcrcgqg43uclagsc1djo.apps.googleusercontent.com";

export function makeVerifier(client = new OAuth2Client()) {
  return async function verify(idToken) {
    const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const p = ticket.getPayload() || {};
    if (!p.sub) throw new Error("토큰에 계정 번호가 없어요.");
    return { sub: String(p.sub), name: String(p.name || p.given_name || ""), email: String(p.email || ""), exp: Number(p.exp) || 0 };
  };
}

// 로컬(vercel dev)에서 두 사람 흐름을 확인할 때만 RECRUIT_DEV_AUTH=1로 켜요. "dev:<번호>:<이름>" 토큰을 받아요.
// 배포된 사이트는 VERCEL_ENV가 production·preview라서 켜지지 않아요. Vercel 환경변수에는 RECRUIT_DEV_AUTH를 넣지 않아요.
export function devAuthOn(env = process.env) {
  return env.RECRUIT_DEV_AUTH === "1" && env.VERCEL_ENV !== "production" && env.VERCEL_ENV !== "preview";
}

let google = null;
export async function verifyGoogleToken(idToken) {
  if (devAuthOn() && idToken.startsWith("dev:")) {
    const [, sub, name = "test"] = idToken.split(":"); // 헤더에는 한글을 못 담아서 이름은 encodeURIComponent로 보내요
    if (!/^\d+$/.test(sub || "")) throw new Error("dev 토큰 번호는 숫자예요.");
    return { sub, name: decodeURIComponent(name), email: "", exp: Math.floor(Date.now() / 1000) + 3600 };
  }
  google = google || makeVerifier();
  return google(idToken);
}
