/**
 * Slug from a name: lowercase, runs of non-alphanumerics become one
 * hyphen, leading/trailing hyphens dropped, max 80 characters.
 *
 * No regex here on purpose: the slug is built from admin-typed text,
 * and a regex over uncontrolled input trips the CodeQL polynomial-ReDoS
 * check. A single linear pass does exactly the same job.
 */
export function slugifyName(name: string): string {
  const lowered = name.toLowerCase().trim();
  let slug = "";
  let lastWasHyphen = true; // drops leading separators
  for (const ch of lowered) {
    const isAlnum =
      (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9");
    if (isAlnum) {
      slug += ch;
      lastWasHyphen = false;
    } else if (!lastWasHyphen) {
      slug += "-";
      lastWasHyphen = true;
    }
  }
  if (slug.endsWith("-")) slug = slug.slice(0, -1);
  return slug.slice(0, 80);
}
