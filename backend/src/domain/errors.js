/**
 * PCHelper (курсовая) — ошибки предметной области.
 *
 * Единый формат: HTTP-статус, машиночитаемый код и сообщение для человека.
 * Middleware Express превращает такую ошибку в JSON того же вида, что и
 * остальные ответы API.
 */

/**
 * Создаёт ошибку API.
 *
 * @param {number} status HTTP-статус.
 * @param {string} code Машиночитаемый код.
 * @param {string} message Сообщение.
 * @returns {Error & {status: number, code: string}}
 */
export function apiError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Ошибка валидации формы (400).
 *
 * @param {string} message Сообщение.
 * @returns {Error & {status: number, code: string}}
 */
export function validation(message) {
  return apiError(400, 'VALIDATION_ERROR', message);
}
