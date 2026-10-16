export interface ApiPagination {
  page?: number;
  offset?: number;
  limit: number;
  total?: number;
  total_pages?: number;
  has_next?: boolean;
  has_more?: boolean;
}

export interface ApiListResponse<T> {
  data: T[];
  pagination?: ApiPagination;
}

export interface ApiItemResponse<T> {
  data: T;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  correlationId?: string;
  details?: Record<string, any>;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}

export interface SkuFilterParams {
  page?: number;
  limit?: number;
  store_id?: string;
  sku_id?: string;
  low_stock_only?: boolean;
  search?: string;
}

export interface OrderFilterParams {
  page?: number;
  limit?: number;
  store_id?: string;
  status?: string;
}

export interface RecommendationFilterParams {
  page?: number;
  limit?: number;
  store_id?: string;
  sku_id?: string;
  status?: string;
}
