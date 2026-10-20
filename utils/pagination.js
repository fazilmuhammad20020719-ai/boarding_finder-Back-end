/**
 * Parse ?limit=&offset= with safe bounds so no list endpoint can return
 * an unbounded number of rows.
 */
const parsePagination = (req, { defaultLimit = 100, maxLimit = 200 } = {}) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || defaultLimit, 1), maxLimit);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  return { limit, offset };
};

/**
 * Build the paginated response body. Rows must include `total_count`
 * (from `COUNT(*) OVER()`), which is stripped from each row.
 */
const paginated = (key, rows, { limit, offset }) => {
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  return {
    [key]: rows.map(({ total_count, ...row }) => row),
    pagination: { total, limit, offset, hasMore: offset + rows.length < total },
  };
};

/** Escape LIKE/ILIKE wildcards so user input is matched literally. */
const escapeLike = (value) => String(value).replace(/[\\%_]/g, (c) => `\\${c}`);

module.exports = { parsePagination, paginated, escapeLike };
