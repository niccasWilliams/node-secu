/**
 * Generic paginated result type for API responses
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  resultsPerPage: number;
  totalPages: number;
  totalResults: number;
}

/**
 * Pagination query parameters
 */
export interface PaginationQuery {
  page?: number;
  resultsPerPage?: number;
}

/**
 * Default pagination values
 */
export const DEFAULT_PAGINATION = {
  page: 1,
  resultsPerPage: 20,
  maxResultsPerPage: 100,
} as const;

/**
 * Helper function to calculate pagination metadata
 */
export function calculatePaginationMeta(
  totalResults: number,
  page: number = DEFAULT_PAGINATION.page,
  resultsPerPage: number = DEFAULT_PAGINATION.resultsPerPage
): PaginationMeta {
  const totalPages = Math.ceil(totalResults / resultsPerPage) || 1;

  return {
    page,
    resultsPerPage,
    totalPages,
    totalResults,
  };
}

/**
 * Helper function to validate and normalize pagination parameters
 */
export function normalizePaginationParams(query: PaginationQuery): {
  page: number;
  resultsPerPage: number;
  offset: number;
} {
  const page = Math.max(1, query.page || DEFAULT_PAGINATION.page);
  const resultsPerPage = Math.min(
    Math.max(1, query.resultsPerPage || DEFAULT_PAGINATION.resultsPerPage),
    DEFAULT_PAGINATION.maxResultsPerPage
  );
  const offset = (page - 1) * resultsPerPage;

  return { page, resultsPerPage, offset };
}
