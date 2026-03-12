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
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(searchParams.get("limit") || String(defaultLimit), 10) || defaultLimit)
  );

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

export function parseCursorParams(searchParams: Record<string, string | string[] | undefined>) {
  const cursor = typeof searchParams.cursor === "string" ? searchParams.cursor : undefined;
  const limit = Math.min(Math.max(1, parseInt(String(searchParams.limit ?? "20"), 10) || 20), 100);
  return { cursor, limit };
}
