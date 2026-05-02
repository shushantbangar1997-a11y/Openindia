const BASE = import.meta.env.BASE_URL;

export function apiUrl(path: string): string {
  // BASE has trailing slash; strip leading slash from path
  const clean = path.replace(/^\//, "");
  return `${BASE}api/${clean}`;
}
