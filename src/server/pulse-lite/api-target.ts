/**
 * Whether a scanned URL is an API, and so judged as one rather than as a website.
 *
 * A JSON response was the only signal, which missed every GraphQL endpoint: asked a plain
 * GET with no query, one answers 204 with no body (countries.trevorblades.com/graphql,
 * behind Stellate), 400, or an HTML playground. The API checks never ran on it and the
 * website checks asked it for an About page. A URL whose path IS the GraphQL endpoint is
 * an API whatever the bare GET returned.
 */
export function answersAsApi(url: string, contentType: string | null): boolean {
  if (contentType && /(^|[/+])json\b/i.test(contentType)) return true;
  try {
    return /(^|\/)graphql\/?$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}
