/**
 * unitKey: facilityName を slug 化し roomNo と結合
 *
 * 例: "パシフィック横浜" + "201" → "パシフィック横浜:201"
 *     slug("パシフィック横浜") → "パシフィック横浜" (日本語はそのまま)
 *     slug("  A棟  ") → "a棟"
 */

/**
 * facilityName を slug 化（小文字化・前後空白除去・記号除去）
 */
export function slugFacility(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s\-_./\\,;:!@#$%^&*()=+[\]{}|<>?'"~`]/g, '');
}

/**
 * unitKey を生成: slug(facilityName) + ":" + roomNo
 */
export function toUnitKey(facilityName: string, roomNo: string): string {
  return `${slugFacility(facilityName)}:${roomNo.trim()}`;
}
