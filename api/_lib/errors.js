// 사람이 읽을 수 있는 문장과 HTTP 상태를 함께 담는 오류예요.
// (api/ 안에서 _로 시작하는 폴더는 Vercel이 API 주소로 만들지 않아요.)
export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
