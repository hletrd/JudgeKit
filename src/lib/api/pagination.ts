import { parsePositiveInt } from "@/lib/validators/query-params";

// Bounded for the same reason as src/lib/pagination.ts: deep OFFSET pagination
// is expensive at scale and only legitimate flows reach the first ~50 pages.
// Use parseCursorParams for endpoints that genuinely need to walk further.
const MAX_PAGE = 1000;

type PaginationOptions = {
  defaultLimit?: number;
  maxLimit?: number;
};

export function parsePagination(
  searchParams: URLSearchParams,
  options: PaginationOptions = {}
) {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;
  const page = Math.min(MAX_PAGE, parsePositiveInt(searchParams.get("page"), 1));
  const limit = Math.min(maxLimit, parsePositiveInt(searchParams.get("limit"), defaultLimit));

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

export function parseCursorParams(searchParams: Record<string, string | string[] | undefined>) {
  const cursor = typeof searchParams.cursor === "string" ? searchParams.cursor : undefined;
  const limit = Math.min(Math.max(1, parsePositiveInt(
    typeof searchParams.limit === "string" ? searchParams.limit : undefined,
    20
  )), 100);
  return { cursor, limit };
}
