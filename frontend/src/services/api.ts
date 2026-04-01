import axios from 'axios';

// Use environment variable if available, otherwise use relative URL
const API_URL = 'http://100.90.201.128:8000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to add the auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle auth errors globally
let isRedirectingForAuthError = false;
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    try {
      const status = error?.response?.status;
      const requestUrl: string | undefined = error?.config?.url;
      const isAuthEndpoint = requestUrl?.includes('/auth/login');

      if ((status === 401 || status === 403) && !isAuthEndpoint) {
        // Clear token and redirect to login on session timeout or forbidden
        localStorage.removeItem('token');
        if (!isRedirectingForAuthError && typeof window !== 'undefined' && window.location.pathname !== '/login') {
          isRedirectingForAuthError = true;
          window.location.href = '/login';
        }
      }
    } catch (e) {
      // swallow any interceptor errors and continue rejecting original error
    }

    console.error('API Error:', error.config?.url, error.message);
    return Promise.reject(error);
  }
);

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'general_operations' | 'cutting' | 'sewing' | 'packaging' | 'creator';
}

export interface UserCreate {
  username: string;
  password: string;
  role: User['role'];
}

export interface UserUpdate {
  username?: string;
  password?: string;
  role?: User['role'];
}

export interface BarcodeData {
  batch_id: number;
  job_order_id: number;
  job_order_number?: string;
  barcode: string;
  brand_id: number;
  model_id: number;
  size_id: number;
  color_id: number;
  client_name: string;
  model_name: string;
  size_value: string;
  color_name: string;
  quantity: number;
  layers: number;
  serial: number;
  phase_name: string;
  current_phase: number;
  status: string;
  is_second_degree?: boolean;
  archived_at?: string | null;
  notes?: string;
}

// Event-based timeline interfaces
export interface BarcodeScanEvent {
  id: number;
  batch_id: number;
  action_type: string;
  phase_id: number;
  phase_name?: string;
  old_status?: string;
  new_status?: string;
  old_quantity?: number;
  new_quantity?: number;
  old_phase?: number;
  new_phase?: number;
  scanned_at: string;
  user_id?: number;
  user_name?: string;
}

export interface TimelineSummaryEntry {
  phase_id: number;
  phase_name: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  status: string;
  quantity_at_start?: number;
  quantity_at_end?: number;
  event_count: number;
}

export interface TimelineSummaryResponse {
  barcode: string;
  timeline_entries: TimelineSummaryEntry[];
  total_entries: number;
  total_events: number;
}

// Legacy timeline interfaces (for backward compatibility)
export interface BarcodeTimelineEntry {
  id: number;
  batch_id: number;
  status: string;
  phase_id: number;
  phase_name: string;
  start_time: string;
  end_time?: string;
  duration_minutes?: number;
  updated_quantity?: number;
  current_quantity: number;
  barcode: string;
}

export interface BarcodeTimelineResponse {
  barcode: string;
  timeline_entries: BarcodeTimelineEntry[];
  total_entries: number;
}

export interface BarcodeListResponse {
  items: BarcodeData[];
  total: number;
}

export interface BarcodeUpdate {
  current_phase?: number;
  status?: string;
  notes?: string;
  quantity?: number;
  deduction_to_phase?: number;
  deduction_reason?: string;
}

export interface BatchStats {
  total_batches: number;
  in_production: number;
  completed: number;
}

export interface PackagingStats {
  completed: number;
  pending: number;
  in_progress: number;
}

export interface PhaseStatusStats {
  pending: number;
  in_progress: number;
}

export interface QCStats {
  pending: number;
  in_progress: number;
  completed: number;
}

export interface PhaseStats {
  cutting: PhaseStatusStats;
  sewing: PhaseStatusStats;
  packaging: PackagingStats;
  qc: QCStats;
}

export interface ProductionStatisticsResponse {
  wip_by_phase: Array<{
    phase_id: number;
    phase_name: string;
    pending: number;
    in_progress: number;
    completed: number;
    total: number;
  }>;
  production_by_client: Array<{
    brand_id: number;
    client_name: string;
    pending: number;
    in_progress: number;
    completed: number;
    total: number;
    total_quantity: number;
  }>;
  production_by_model: Array<{
    model_id: number;
    model_name: string;
    client_name: string;
    pending: number;
    in_progress: number;
    completed: number;
    total: number;
    total_quantity: number;
  }>;
  recent_activity: Array<{
    date: string;
    total_events: number;
    unique_batches: number;
  }>;
  bottlenecks: Array<{
    phase_name: string;
    client_name: string;
    model_name: string;
    pending_count: number;
    total_quantity: number;
  }>;
  overall_stats: {
    total_batches: number;
    total_pending: number;
    total_in_progress: number;
    total_completed: number;
    total_quantity: number;
    completion_rate: number;
  };
  second_degree_stats: {
    second_degree_batches: number;
    second_degree_quantity: number;
    second_degree_percentage: number;
  };
}

export interface ClientStatisticsResponse {
  client_info: {
    brand_id: number;
    client_name: string;
  };
  phases: Array<{
    phase_id: number;
    phase_name: string;
    pending: number;
    in_progress: number;
    completed: number;
    total: number;
    total_quantity: number;
  }>;
  models: Array<{
    model_id: number;
    model_name: string;
    pending: number;
    in_progress: number;
    completed: number;
    total: number;
    total_quantity: number;
  }>;
}

export interface ModelStatisticsResponse {
  model_info: {
    model_id: number;
    model_name: string;
    client_name: string;
  };
  phases: Array<{
    phase_id: number;
    phase_name: string;
    pending: number;
    in_progress: number;
    completed: number;
    total: number;
    total_quantity: number;
  }>;
}

// Model History interfaces
export interface ModelHistoryEntry {
  model_name: string;
  color_name: string;
  size_value: string;
  job_order_number: string;
  phase_name: string;
  entry_time: string;
  exit_time?: string;
  duration_minutes?: number;
  status: string;
  quantity: number;
}

export interface ModelHistorySizeData {
  size_value: string;
  item_id: number;
  entries: ModelHistoryEntry[];
  total_duration_minutes: number;
  entry_count: number;
}

export interface ModelHistoryGroup {
  job_order_number: string;
  color_name: string;
  model_name: string;
  total_entries: number;
  total_duration_minutes: number;
  sizes: {[sizeValue: string]: ModelHistorySizeData};
}

export interface ModelHistoryResponse {
  job_order_color_groups: {[jobOrderColorKey: string]: ModelHistoryGroup};
}

export interface BatchDetail {
  batch_id: number;
  barcode: string;
  quantity: number;
  current_phase: number;
  phase_name: string;
  status: string;
  is_second_degree: boolean;
  last_updated_at?: string | null;
}

export interface PhaseStatusGroup {
  phase_name: string;
  status: string;
  batches: BatchDetail[];
  total_quantity: number;
  batch_count: number;
}

export interface JobOrderItemBatchDetails {
  item_id: number;
  job_order_number: string;
  model_name: string;
  color_name: string;
  size_value: string;
  expected_quantity: number;
  total_batch_quantity: number;
  remaining_quantity: number;
  phase_status_groups: PhaseStatusGroup[];
}

// Job Order interfaces
export interface JobOrderItem {
  item_id: number;
  job_order_id: number;
  color_id: number;
  color_name?: string;
  size_id: number;
  size_value?: string;
  quantity: number;
  notes?: string;
}

export interface JobOrderItemWithDetails {
  item_id: number;
  job_order_id: number;
  color_id: number;
  color_name: string;
  size_id: number;
  size_value: string;
  quantity: number;
  notes?: string;
}

export interface JobOrder {
  job_order_id: number;
  model_id: number;
  job_order_number: string;
  model_name?: string;
  brand_id?: number;
  client_name?: string;
  items: JobOrderItem[];
  total_working_quantity?: number;
  notes?: string;
  priority?: number;
}

export interface JobOrderCreate {
  model_id: number;
  job_order_number: string;
  items: {
    color_id: number;
    size_id: number;
    quantity: number;
  }[];
}

export interface JobOrderCreateWithNames {
  model_name: string;
  job_order_number: string;
  items: {
    color_name: string;
    size_value: string;
    quantity: number;
    notes?: string;
  }[];
}

export interface JobOrderUpdate {
  model_id?: number;
  job_order_number?: string;
  items?: {
    item_id: number;
    quantity: number;
    notes?: string;
  }[];
  notes?: string;
}

export interface JobOrderProductionTracking {
  job_order_id: number;
  job_order_number: string;
  tracking_data: {
    item_id: number;
    color_id: number;
    color_name: string;
    size_id: number;
    size_value: string;
    expected_quantity: number;
    produced_quantity: number;
    cut_quantity: number;
    working_quantity: number;
    second_degree_quantity: number;
    completed_quantity: number;
    remaining_quantity: number;
    production_status: string;
  }[];
}

export interface JobOrderOverallStatus {
  job_order_id: number;
  job_order_number: string;
  model_name: string;
  total_expected: number;
  total_produced: number;
  total_remaining: number;
  overall_status: string;
  completion_percentage: number;
}

export interface JobOrderSummary {
  job_order_id: number;
  job_order_number: string;
  model_name?: string;
  client_name?: string;
  total_items: number;
  total_expected_quantity: number;
  total_produced_quantity: number;
  cut_quantity: number;
  second_degree_quantity: number;
  completed_quantity: number;
  working_quantity: number;
  remaining_quantity: number;
  total_batches: number;
  has_issues: boolean;
  has_high_second_degree: boolean;
  has_stalled_batches: boolean;
  completion_percentage: number;
  overproduction_quantity: number;
  notes?: string;
  priority?: number;
  last_calculated_at?: string;
  last_quantity_change?: string;
  last_completion_change?: string;
  last_new_batch?: string;
  last_batch_update?: string;
}

export interface JobOrderItemSummary {
  item_id: number;
  job_order_id: number;
  color_id: number;
  size_id: number;
  color_name: string;
  size_value: string;
  expected_quantity: number;
  produced_quantity: number;
  cut_quantity: number;
  cut_inspection_qty: number;
  second_degree_cut_qty: number;
  sewing_in_qty: number;
  sewing_out_qty: number;
  packaging_in_qty: number;
  packaging_out_qty: number;
  second_degree_quantity: number;
  completed_quantity: number;
  working_quantity: number;
  remaining_quantity: number;
  lost_qty: number;
  total_batches: number;
  has_issues: boolean;
  completion_percentage: number;
  overproduction_quantity: number;
  production_status: string;
  notes?: string;
  true_consumption?: number;
  last_calculated_at?: string;
  last_quantity_change?: string;
  last_completion_change?: string;
  last_new_batch?: string;
  last_batch_update?: string;
}

export interface JobOrderItemSummaryListResponse {
  items: JobOrderItemSummary[];
  total: number;
}

export interface ArchivedJobOrderItem {
  item_id: number;
  job_order_id: number;
  job_order_number?: string | null;
  color_id: number;
  size_id: number;
  quantity: number;
  weight?: number | null;
  notes?: string | null;
  archived_at: string;
  color_name?: string | null;
  size_value?: string | null;
}

export interface JobOrderListResponse {
  items: JobOrder[];
  total: number;
}

export interface BulkValidationResponse {
  valid_rows: any[];
  error_rows: { rowNumber: number; data: any; error: string }[];
}

export interface BulkSubmitResponse {
  created_batches: any[];
  duplicate_barcodes: any[];
  message: string;
}

export const authApi = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    
    const response = await api.post<LoginResponse>('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },

  updateUser: async (userData: UserUpdate): Promise<User> => {
    const response = await api.put<User>('/auth/me', userData);
    return response.data;
  },

  // Admin only endpoints
  getAllUsers: async (): Promise<User[]> => {
    const response = await api.get<User[]>('/auth/users');
    return response.data;
  },

  createUser: async (userData: UserCreate): Promise<User> => {
    const response = await api.post<User>('/auth/users', userData);
    return response.data;
  },

  updateUserById: async (userId: number, userData: UserUpdate): Promise<User> => {
    const response = await api.put<User>(`/auth/users/${userId}`, userData);
    return response.data;
  },

  deleteUser: async (userId: number): Promise<void> => {
    await api.delete(`/auth/users/${userId}`);
  },

  resetPassword: async (userId: number, newPassword: string): Promise<void> => {
    await api.put(`/auth/users/${userId}/reset-password`, { new_password: newPassword });
  },
};

export interface GeneratedBatch {
  batch: number;
  size: string;
  quantity: number;
  barcode: string;
  size_id?: number;
  serial_number?: number;
  layers?: number;
}

export interface BatchSubmitRequest {
  batches: GeneratedBatch[];
  job_order_id: number;
  color_id: number;
}

export const batchApi = {
  generate: async (
    jobOrderId: number,
    cutNumber: string,
    mode?: string,
    quantityPerBatch?: Record<string, number>,
    extraPiecesThreshold?: number,
    maxBatchSize?: number
  ): Promise<GeneratedBatch[]> => {
    const requestData: any = {
      job_order_id: jobOrderId,
      cut_number: cutNumber,
      mode: mode || 'auto'
    };

    if (mode === 'manual') {
      requestData.quantity_per_batch = quantityPerBatch;
      requestData.extra_pieces_threshold = extraPiecesThreshold || 5;
    } else {
      if (maxBatchSize) {
        requestData.max_batch_size = maxBatchSize;
      }
      if (extraPiecesThreshold !== undefined) {
        requestData.extra_pieces_threshold = extraPiecesThreshold;
      }
    }

    const response = await api.post('/batches/generate', requestData);
    return response.data;
  },
  submit: async (request: BatchSubmitRequest) => {
    const response = await api.post('/batches/submit', request);
    return response.data;
  },
  createCompensation: async (request: {job_order_id: number; compensations: Array<{item_id: number; phase_id: number; quantity: number; notes?: string}>}) => {
    const response = await api.post<BulkSubmitResponse>('/batches/create-compensation', request);
    return response.data;
  },

  createSecondDegree: async (request: {job_order_id: number; items: Array<{item_id: number; count: number}>}) => {
    const response = await api.post('/batches/create-second-degree', request);
    return response.data;
  },
};

export const barcodeApi = {
  scanBarcode: async (barcode: string): Promise<BarcodeData> => {
    const response = await api.get<BarcodeData>(`/batches/barcode/${barcode}`);
    return response.data;
  },

  updateBarcode: async (barcode: string, update: BarcodeUpdate): Promise<BarcodeData> => {
    const response = await api.put<BarcodeData>(`/batches/barcode/${barcode}`, update);
    return response.data;
  },

  getBarcodes: async (params?: {
    skip?: number;
    limit?: number;
    barcode?: string;
    client?: string;
    model?: string;
    size?: string;
    color?: string;
    phase?: string;
    status?: string;
    archived?: boolean;
    job_order_id?: number;
    color_id?: number;
    is_second_degree?: boolean;
  }): Promise<BarcodeListResponse> => {
    const response = await api.get<BarcodeListResponse>('/batches/', { params });
    return response.data;
  },

  getBatchStats: async (): Promise<BatchStats> => {
    const response = await api.get<BatchStats>('/batches/stats');
    return response.data;
  },

  getPhaseStats: async (): Promise<PhaseStats> => {
    const response = await api.get<PhaseStats>('/batches/phase-stats');
    return response.data;
  },

  getBarcodesByPhase: async (phase: string, status: string): Promise<BarcodeListResponse> => {
    const response = await api.get<BarcodeListResponse>('/batches/', {
      params: {
        phase: phase,
        status: status
      }
    });
    return response.data;
  },

  downloadTemplate: async (): Promise<Blob> => {
    const response = await api.get('/barcodes/template', {
      responseType: 'blob'
    });
    return response.data;
  },

  validateBulkBarcodes: async (file: File): Promise<BulkValidationResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<BulkValidationResponse>('/barcodes/bulk/validate', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  submitBulkBarcodes: async (barcodes: any[]): Promise<BulkSubmitResponse> => {
    const response = await api.post<BulkSubmitResponse>('/barcodes/bulk/submit', barcodes);
    return response.data;
  },

  getPrinters: async (): Promise<{ printers: string[] }> => {
    const response = await api.get<{ printers: string[] }>('/barcodes/printers');
    return response.data;
  },

  printBarcodes: async (barcodes: any[], count: number, printerName: string): Promise<any> => {
    const response = await api.post('/barcodes/print', {
      barcodes,
      count,
      printer_name: printerName
    });
    return response.data;
  },

  getBatchesByJobOrderAndColor: async (jobOrderId: number, colorId: number): Promise<{ total_quantity: number }> => {
    const response = await api.get<BarcodeListResponse>('/batches/', {
      params: {
        job_order_id: jobOrderId,
        color_id: colorId
      }
    });
    
    const totalQuantity = response.data.items.reduce((sum, batch) => sum + batch.quantity, 0);
    return { total_quantity: totalQuantity };
  },

  getRemainingQuantityForPhaseStatus: async (jobOrderId: number, colorId: number, sizeId: number, phaseId: number, status: string): Promise<{ remaining_quantity: number; total_batches: number; job_order_item_quantity: number }> => {
    const response = await api.get<{ remaining_quantity: number; total_batches: number; job_order_item_quantity: number }>(`/batches/remaining-quantity/${jobOrderId}/${colorId}/${sizeId}`, {
      params: {
        phase_id: phaseId,
        status: status
      }
    });
    return response.data;
  },
  getBatchById: async (batch_id: number | string): Promise<BarcodeData> => {
    const response = await api.get<BarcodeData>(`/batches/${batch_id}`);
    return response.data;
  },

  getPhases: async (): Promise<{ phase_id: number; phase_name: string; type?: string; sequence_order?: number }[]> => {
    const response = await api.get<{ phase_id: number; phase_name: string; type?: string; sequence_order?: number }[]>('/phases/');
    return response.data;
  },

  getBarcodeTimeline: async (batch_id: number): Promise<BarcodeTimelineResponse> => {
    const response = await api.get<BarcodeTimelineResponse>(`/batches/${batch_id}/timeline/details`);
    return response.data;
  },

  // Event-based timeline API functions
  getBatchScanEvents: async (batch_id: number, limit: number = 100): Promise<BarcodeScanEvent[]> => {
    const response = await api.get<BarcodeScanEvent[]>(`/batches/${batch_id}/events`, { params: { limit } });
    return response.data;
  },
  getBatchVisitedPhases: async (batch_id: number): Promise<Array<{phase_id: number, phase_name: string, sequence_order?: number, type?: string}>> => {
    const response = await api.get<Array<{phase_id: number, phase_name: string, sequence_order?: number, type?: string}>>(`/batches/${batch_id}/visited-phases`);
    return response.data;
  },

  getBatchProductionStages: async (batch_id: number, phase_id?: number): Promise<Array<{stage_id: number; stage_name: string; schematic_id?: number; schematic_name?: string; stage_order?: number}>> => {
    const params = phase_id != null ? { phase_id } : {};
    const response = await api.get<Array<{stage_id: number; stage_name: string; schematic_id?: number; schematic_name?: string; stage_order?: number}>>(`/batches/${batch_id}/production-stages`, { params });
    return response.data;
  },

  getBatchProductionDailyAssignments: async (batch_id: number, phase_id?: number): Promise<Array<{daily_assignment_id: number; worker_id: number; worker_name: string; stage_name: string; quantity_produced: number; assignment_date?: string}>> => {
    const params = phase_id != null ? { phase_id } : {};
    const response = await api.get<Array<{daily_assignment_id: number; worker_id: number; worker_name: string; stage_name: string; quantity_produced: number; assignment_date?: string}>>(`/batches/${batch_id}/production-daily-assignments`, { params });
    return response.data;
  },

  getBatchTimelineSummary: async (batch_id: number): Promise<TimelineSummaryResponse> => {
    const response = await api.get<TimelineSummaryResponse>(`/batches/${batch_id}/timeline/summary`);
    return response.data;
  },

  getJobOrderItemByBarcode: async (barcode: string): Promise<{
    item_id: number;
    job_order_id: number;
    color_id: number;
    size_id: number;
    expected_quantity: number;
    notes?: string;
  }> => {
    const response = await api.get(`/batches/barcode/${barcode}/job-order-item`);
    return response.data;
  },

  getCurrentBatchesByPhase: async (): Promise<{
    [phaseName: string]: {
      model_color_groups: {
        [modelColorKey: string]: {
          model_name: string;
          color_name: string;
          total_quantity: number;
          expected_quantity: number;
          batch_count: number;
          time_in_phase: string;
          sizes: Array<{
            size_value: string;
            quantity: number;
            expected_quantity: number;
            batch_count: number;
            time_in_phase: string;
          }>;
          second_degree_sizes: Array<{
            size_value: string;
            quantity: number;
            expected_quantity: number;
            batch_count: number;
            time_in_phase: string;
          }>;
        };
      };
      daily_throughput: {
        scanned_in: number;
        completed: number;
        efficiency_ratio: number;
      };
    };
  }> => {
    const response = await api.get('/batches/by-phase/current');
    return response.data;
  },
};

export const jobOrderApi = {
  getAll: async (params?: {
    skip?: number;
    limit?: number;
    job_order_number?: string;
    model_name?: string;
    client_name?: string;
    issues_first?: boolean;
  }): Promise<JobOrderListResponse> => {
    const response = await api.get<JobOrderListResponse>('/job-orders/', { params });
    return response.data;
  },

  getAllSimple: async (): Promise<{job_order_id: number, job_order_number: string, model_name: string | null, client_name: string | null}[]> => {
    const response = await api.get<{job_order_id: number, job_order_number: string, model_name: string | null, client_name: string | null}[]>('/job-orders/simple/');
    return response.data;
  },

  getById: async (id: number): Promise<JobOrder> => {
    const response = await api.get(`/job-orders/${id}`);
    return response.data;
  },

  getByNumber: async (number: string): Promise<JobOrder> => {
    const response = await api.get(`/job-orders/number/${number}`);
    return response.data;
  },

  create: async (jobOrder: JobOrderCreate): Promise<JobOrder> => {
    const response = await api.post('/job-orders/', jobOrder);
    return response.data;
  },

  createWithNames: async (jobOrder: JobOrderCreateWithNames): Promise<JobOrder> => {
    const response = await api.post('/job-orders/with-names/', jobOrder);
    return response.data;
  },

  update: async (id: number, jobOrder: JobOrderUpdate): Promise<JobOrder> => {
    const response = await api.put(`/job-orders/${id}`, jobOrder);
    return response.data;
  },

  updateItemNotes: async (itemId: number, notes: string): Promise<JobOrderItem> => {
    const response = await api.put(`/job-orders/items/${itemId}/notes`, { notes });
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/job-orders/${id}`);
  },

  getByModel: async (modelId: number): Promise<JobOrder[]> => {
    const response = await api.get(`/job-orders/model/${modelId}`);
    return response.data;
  },

  getProductionTracking: async (id: number): Promise<JobOrderProductionTracking> => {
    const response = await api.get(`/job-orders/${id}/production-tracking`);
    return response.data;
  },

  getOverallStatus: async (id: number): Promise<JobOrderOverallStatus> => {
    const response = await api.get(`/job-orders/${id}/overall-status`);
    return response.data;
  },

  getExistingColors: async (): Promise<string[]> => {
    const response = await api.get<string[]>('/job-orders/options/colors');
    return response.data;
  },

  getExistingSizes: async (): Promise<string[]> => {
    const response = await api.get<string[]>('/job-orders/options/sizes');
    return response.data;
  },

  getExistingModels: async (): Promise<string[]> => {
    const response = await api.get<string[]>('/job-orders/options/models');
    return response.data;
  },

  getExistingMaterials: async (): Promise<string[]> => {
    const response = await api.get<string[]>('/job-orders/options/materials');
    return response.data;
  },

  getItemsWithDetails: async (jobOrderId: number): Promise<JobOrderItemWithDetails[]> => {
    const response = await api.get<JobOrderItemWithDetails[]>(`/job-orders/${jobOrderId}/items-with-details/`);
    return response.data;
  },

  getCompensations: async (jobOrderId: number): Promise<{
    phase_summary: Array<{
      phase_id: number;
      phase_name: string;
      count: number;
    }>;
    color_summary: Array<{
      color_name: string;
      count: number;
    }>;
    compensations: Array<{
      compensation_id: number;
      batch_id: number;
      item_id: number;
      phase_id: number;
      phase_name: string;
      quantity: number;
      created_at: string | null;
      created_by_user_id: number | null;
      created_by_username: string | null;
      color_name: string;
      size_value: string;
      barcode: string;
      batch_quantity: number;
    }>;
  }> => {
    const response = await api.get(`/job-orders/${jobOrderId}/compensations`);
    return response.data;
  },
  getMaterials: async (jobOrderId: number): Promise<{id:number,material_id:number,material_name:string,color_name?:string,quantity:number,consumption?:number,notes?:string}[]> => {
    const response = await api.get(`/job-orders/${jobOrderId}/materials`);
    return response.data;
  },

  getSummary: async (params: any): Promise<{items: JobOrderSummary[], total: number}> => {
    const response = await api.get<{items: JobOrderSummary[], total: number}>('/job-orders/summary/', { params });
    return response.data;
  },

  archive: async (id: number): Promise<void> => {
    await api.post(`/job-orders/${id}/archive`);
  },

  archiveBulk: async (jobOrderIds: number[]): Promise<void> => {
    await api.post('/job-orders/archive/bulk', { job_order_ids: jobOrderIds });
  },

  // Item-level API functions
  getItemSummaries: async (params?: {
    skip?: number;
    limit?: number;
    job_order_id?: number;
    color_name?: string;
    size_value?: string;
    production_status?: string;
    has_issues?: boolean;
  }): Promise<JobOrderItemSummaryListResponse> => {
    const response = await api.get<JobOrderItemSummaryListResponse>('/job-orders/items/summary/', { params });
    return response.data;
  },

  getItemProductionTracking: async (itemId: number): Promise<JobOrderItemSummary> => {
    const response = await api.get<JobOrderItemSummary>(`/job-orders/items/${itemId}/tracking`);
    return response.data;
  },

  getItemsWithIssues: async (params?: {
    skip?: number;
    limit?: number;
  }): Promise<JobOrderItemSummaryListResponse> => {
    const response = await api.get<JobOrderItemSummaryListResponse>('/job-orders/items/issues/', { params });
    return response.data;
  },

  getItemsHighSecondDegree: async (params?: {
    skip?: number;
    limit?: number;
  }): Promise<JobOrderItemSummaryListResponse> => {
    const response = await api.get<JobOrderItemSummaryListResponse>('/job-orders/items/high-second-degree/', { params });
    return response.data;
  },

  getItemsWithQuantityReductions: async (params?: {
    skip?: number;
    limit?: number;
  }): Promise<JobOrderItemSummaryListResponse> => {
    const response = await api.get<JobOrderItemSummaryListResponse>('/job-orders/items/quantity-reductions/', { params });
    return response.data;
  },

  getItemsQuantityBreakdown: async (jobOrderId: number): Promise<JobOrderItemSummaryListResponse> => {
    const response = await api.get<JobOrderItemSummaryListResponse>(`/job-orders/${jobOrderId}/items/quantity-breakdown/`);
    return response.data;
  },

  refreshItemSummaries: async (jobOrderId?: number): Promise<{message: string}> => {
    const params = jobOrderId ? { job_order_id: jobOrderId } : {};
    const response = await api.post('/job-orders/items/refresh-summary/', null, { params });
    return response.data;
  },

  getItemLevelStatistics: async (): Promise<any> => {
    const response = await api.get('/job-orders/items/statistics/');
    return response.data;
  },

  archiveItem: async (itemId: number): Promise<{message: string, archived_item_id: number}> => {
    const response = await api.post(`/job-orders/items/${itemId}/archive`);
    return response.data;
  },

  getAllArchivedItems: async (params?: {
    skip?: number;
    limit?: number;
    job_order_id?: number;
    color_name?: string;
    size_value?: string;
  }): Promise<ArchivedJobOrderItem[]> => {
    const response = await api.get('/job-orders/archive/items/', { params });
    return response.data;
  },

  restoreItem: async (itemId: number): Promise<{message: string, restored_item_id: number}> => {
    const response = await api.post(`/job-orders/items/${itemId}/restore`);
    return response.data;
  },

  restoreJobOrder: async (jobOrderId: number): Promise<{message: string, restored_job_order_id: number}> => {
    const response = await api.post(`/job-orders/archive/${jobOrderId}/restore`);
    return response.data;
  },

  deleteArchivedJobOrder: async (jobOrderId: number): Promise<{message: string, job_order_id: number, deleted_items: number, deleted_batches: number}> => {
    const response = await api.delete(`/job-orders/archive/${jobOrderId}/delete`);
    return response.data;
  },

  deleteArchivedItem: async (itemId: number): Promise<{message: string, item_id: number, deleted_batches: number}> => {
    const response = await api.delete(`/job-orders/items/${itemId}/delete`);
    return response.data;
  },

  recoverBatch: async (batchId: number): Promise<{message: string, batch_id: number}> => {
    const response = await api.post(`/batches/archived/${batchId}/recover`);
    return response.data;
  },

  deleteArchivedBatch: async (batchId: number): Promise<{message: string, batch_id: number}> => {
    const response = await api.delete(`/batches/archived/${batchId}`);
    return response.data;
  },

  bulkUpdatePriorities: async (updates: Array<{job_order_id: number, priority: number}>): Promise<{message: string, updated_count: number}> => {
    const response = await api.post('/job-orders/priorities/bulk-update', { updates });
    return response.data;
  },

  getCuts: async (jobOrderId: number): Promise<Array<{cut_number: string, cut_id: number, color: string, color_id: number}>> => {
    const response = await api.get(`/job-orders/${jobOrderId}/cuts`);
    return response.data;
  },
};

export async function refreshJobOrderSummary() {
  // Use the new item-level refresh endpoint
  await api.post('/job-orders/items/refresh-summary/');
}

export interface CutSizeDetail {
  size_id: number;
  size_value: string;
  item_id: number;
  total_pieces: number;
  ratio?: number | null; // Ratio (pieces per layer) for this size
}

export type CutPrintStatus = 'pending' | 'in_progress' | 'completed';

export interface CutDetails {
  cut_id: number;
  job_order_id: number;
  job_order_number: string;
  model_id: number;
  model_name: string;
  color_id: number;
  color_name: string;
  waste_fabric_weight: number | null;
  marker_length?: number | null;
  created_at: string | null;
  cut_weight: number;
  num_of_rolls_used: number;
  total_layers: number;
  created_by_user_id: number | null;
  notes: string | null;
  print_status?: CutPrintStatus | null;
  requires_printing?: boolean;
  job_order_print_config?: Record<string, any> | null;
  sizes: CutSizeDetail[];
}

export interface CutRoll {
  roll_id: number;
  cut_id: number;
  roll_number: number;
  weight: number;
  layer_weight: number;
  num_of_layers: number;
  roll_width?: number | null;
  created_at: string | null;
}

export interface CutSizeTransition {
  transition_id: number;
  cut_id: number;
  from_item_id: number;
  to_item_id: number;
  from_size_id: number;
  from_size_value: string;
  to_size_id: number;
  to_size_value: string;
  quantity: number;
  notes: string | null;
  created_at: string | null;
}

export interface CutDetailsFull extends CutDetails {
  job_order_items_ratios?: { [key: string]: number } | null; // JSONB ratios: {"item_id": ratio}
  rolls: CutRoll[];
  transitions: CutSizeTransition[];
}

export interface CutDetailsListResponse {
  cuts: CutDetails[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface CutFilterOptions {
  job_orders: Array<{ id: number; number: string }>;
  models: Array<{ id: number; name: string }>;
  colors: Array<{ id: number; name: string }>;
  print_statuses: Array<{ value: string; label: string }>;
}

export const cutsApi = {
  getAllCuts: async (
    page: number = 1, 
    limit: number = 10,
    filters?: {
      job_order_id?: number;
      model_id?: number;
      color_id?: number;
      print_status?: string;
    }
  ): Promise<CutDetailsListResponse | CutDetails[]> => {
    const params: any = { page, limit };
    if (filters) {
      if (filters.job_order_id !== undefined) params.job_order_id = filters.job_order_id;
      if (filters.model_id !== undefined) params.model_id = filters.model_id;
      if (filters.color_id !== undefined) params.color_id = filters.color_id;
      if (filters.print_status) params.print_status = filters.print_status;
    }
    const response = await api.get('/cuts/', { params });
    return response.data;
  },

  getFilterOptions: async (): Promise<CutFilterOptions> => {
    const response = await api.get<CutFilterOptions>('/cuts/filter-options');
    return response.data;
  },

  getCutById: async (cutId: number): Promise<CutDetailsFull> => {
    const response = await api.get<CutDetailsFull>(`/cuts/${cutId}`);
    return response.data;
  },

  createCut: async (cut: {
    job_order_id: number;
    color_id: number;
    job_order_items_ratios: { [key: string]: number };
    waste_fabric_weight?: number;
    notes?: string;
    print_status?: CutPrintStatus;
    rolls?: Array<{
      roll_number: number;
      weight: number;
      layer_weight: number;
      num_of_layers: number;
    }>;
    transitions?: Array<{
      from_item_id: number;
      to_item_id: number;
      quantity: number;
      notes?: string;
    }>;
  }): Promise<CutDetailsFull> => {
    const response = await api.post<CutDetailsFull>('/cuts/', cut);
    return response.data;
  },

  updateCut: async (
    cutId: number,
    cut: {
      job_order_id?: number;
      color_id?: number;
      job_order_items_ratios?: { [key: string]: number };
      waste_fabric_weight?: number;
      notes?: string;
      print_status?: CutPrintStatus;
      rolls?: Array<{
        roll_number: number;
        weight: number;
        layer_weight: number;
        num_of_layers: number;
      }>;
      transitions?: Array<{
        from_item_id: number;
        to_item_id: number;
        quantity: number;
        notes?: string;
      }>;
    }
  ): Promise<CutDetailsFull> => {
    const response = await api.put<CutDetailsFull>(`/cuts/${cutId}`, cut);
    return response.data;
  },

  deleteCut: async (cutId: number): Promise<{ message: string; cut_id: number }> => {
    const response = await api.delete<{ message: string; cut_id: number }>(`/cuts/${cutId}`);
    return response.data;
  },
};

// Production management - sewing line schematics
export interface SewingLineSchematic {
  schematic_id: number;
  production_phase_id: number;
  name: string;
  active: boolean;
  phase_name?: string | null;
  working_hours?: number | null;
  hourly_production?: number | null;
}

export interface SewingLineStageResponse {
  stage_id: number;
  schematic_id: number;
  stage_name: string;
  stage_order: number;
  production_qty?: number | null;
  is_in_final_stage: boolean;
  active: boolean;
}

export interface SewingLineSchematicDetail extends SewingLineSchematic {
  stages: SewingLineStageResponse[];
}

export interface SewingLineStageCreate {
  stage_name: string;
  stage_order: number;
  production_qty?: number | null;
  is_in_final_stage?: boolean;
  active?: boolean;
}

export interface SewingLineSchematicCreate {
  production_phase_id: number;
  name: string;
  active?: boolean;
  working_hours?: number | null;
  hourly_production?: number | null;
  stages?: SewingLineStageCreate[];
}

export interface SewingLineSchematicUpdate {
  production_phase_id?: number;
  name?: string;
  active?: boolean;
  working_hours?: number | null;
  hourly_production?: number | null;
  stages?: SewingLineStageCreate[];
}

export interface StageOption {
  stage_id: number;
  stage_name: string;
  schematic_id: number;
  schematic_name: string;
  stage_order: number;
}

export interface DailyAssignmentResponse {
  daily_assignment_id: number;
  assignment_date: string;
  worker_id: number;
  worker_name: string;
  stage_id: number;
  stage_name: string;
  schematic_name: string;
  working_hours?: number | null;
  active: boolean;
}

export interface DailyAssignmentCreate {
  assignment_date: string;
  worker_id: number;
  stage_id: number;
  active?: boolean;
}

export interface ReworkBatchCreate {
  source_batch_id: number;
  problem_stage_name: string;
}

export interface ReworkBatchUpdate {
  printed?: boolean;
}

export interface ReworkBatchResponse {
  rework_batch_id: number;
  batch_id: number;
  barcode?: string | null;
  source_batch_id?: number | null;
  job_order_id?: number | null;
  problem_stage_name: string;
  responsible_phase_id?: number | null;
  printed: boolean;
  created_at: string;
  created_by_user_id?: number | null;
}


export interface RecordProductionRequest {
  daily_assignment_id: number;
  barcode: string;
  quantity?: number;
  /** Date used to validate assignment (e.g. client "today"); must match assignment's date. */
  tracking_date?: string | null;
}

export interface RecordProductionResponse {
  production_id: number;
  batch_id: number;
  barcode: string;
  quantity_produced: number;
}

export interface MaxProductionQuantityResponse {
  max_allowed: number | null;
  total_already: number;
  batch_quantity: number | null;
}

export interface Worker {
  worker_id: number;
  worker_name: string;
  worker_group_id?: number | null;
  active: boolean;
}

export interface WorkerCreate {
  worker_name: string;
  active?: boolean;
  worker_id?: number | null;  // Optional manual PK; API checks for conflict
  worker_group_id?: number | null;
}

export interface WorkerUpdate {
  worker_name?: string;
  active?: boolean;
  worker_group_id?: number | null;
}

export interface WorkerGroup {
  group_id: number;
  group_name: string;
  working_hours?: number | null;
}

export interface WorkerGroupCreate {
  group_name: string;
  working_hours?: number | null;
}

export interface WorkerGroupUpdate {
  group_name?: string;
  working_hours?: number | null;
}

export interface WorkerOvertimeRequestCreate {
  phase_id: number;
  schematic_id: number;
  work_date: string;
  overtime_hours: number;
  worker_ids: number[];
  notes?: string | null;
}

export interface WorkerOvertimeRequestResponse {
  request_id: number;
  status: string;
}

export interface WorkerOvertimePendingWorker {
  worker_id: number;
  worker_name: string;
}

export interface WorkerOvertimePendingRequest {
  request_id: number;
  phase_id: number;
  phase_name: string;
  schematic_id: number;
  schematic_name: string;
  work_date: string;
  overtime_hours: number;
  workers: WorkerOvertimePendingWorker[];
}

export interface PhaseDailyProduction {
  phase_id: number;
  date: string;
  total_quantity: number;
  first_timestamp?: string | null;
  last_timestamp?: string | null;
}

export interface PhaseExpectedWorkRange {
  phase_id: number;
  date_from: string;
  date_to: string;
  expected_quantity: number;
  working_days_count: number;
  expected_hourly_work: number;
  working_hours_per_day: number;
  total_possible_working_hours: number;
}

export interface SchematicWorkRangeStat {
  schematic_id: number;
  schematic_name: string;
  expected_quantity: number;
  expected_hourly_work: number;
  true_quantity: number;
  true_hourly_work: number;
  efficiency_pct?: number | null;
}

export interface PhaseSchematicWorkRangeResponse {
  phase_id: number;
  date_from: string;
  date_to: string;
  schematics: SchematicWorkRangeStat[];
}

export interface SchematicDailyProductionRecord {
  phase_id: number;
  phase_name: string;
  schematic_id: number;
  schematic_name: string;
  work_date: string;
  expected_output: number;
  true_output: number;
}

export interface SchematicWorkerDayRecord {
  worker_id: number;
  worker_name: string;
  stage_id: number;
  stage_name: string;
  stage_order: number;
  work_date: string;
  expected_output: number;
  true_output: number;
  efficiency_pct?: number | null;
}

export interface SchematicWorkerAggregate {
  worker_id: number;
  worker_name: string;
  total_expected_output: number;
  total_true_output: number;
  efficiency_pct?: number | null;
}

export interface SchematicWorkerBreakdownResponse {
  schematic_id: number;
  date_from: string;
  date_to: string;
  records: SchematicWorkerDayRecord[];
  aggregates: SchematicWorkerAggregate[];
}

export interface WorkerProductionRecord {
  worker_id: number;
  worker_name: string;
  phase_id: number;
  phase_name: string;
  schematic_id: number;
  schematic_name: string;
  work_date: string;
  expected_output: number;
  true_output: number;
  working_hours: number;
  overtime_hours: number;
  efficiency_pct?: number | null;
}

export interface WorkerProductionAggregate {
  worker_id: number;
  worker_name: string;
  total_expected_output: number;
  total_true_output: number;
  total_working_hours: number;
  total_overtime_hours: number;
  efficiency_pct?: number | null;
}

export interface AllWorkersProductionBreakdownResponse {
  date_from: string;
  date_to: string;
  records: WorkerProductionRecord[];
  aggregates: WorkerProductionAggregate[];
}

export const productionApi = {
  getSchematics: async (params?: { skip?: number; limit?: number; active_only?: boolean }): Promise<SewingLineSchematic[]> => {
    const response = await api.get<SewingLineSchematic[]>('/production/schematics', { params });
    return response.data;
  },

  getSchematicById: async (schematicId: number): Promise<SewingLineSchematicDetail> => {
    const response = await api.get<SewingLineSchematicDetail>(`/production/schematics/${schematicId}`);
    return response.data;
  },

  createSchematic: async (data: SewingLineSchematicCreate): Promise<SewingLineSchematic> => {
    const response = await api.post<SewingLineSchematic>('/production/schematics', data);
    return response.data;
  },

  updateSchematic: async (
    schematicId: number,
    data: SewingLineSchematicUpdate
  ): Promise<SewingLineSchematic> => {
    const response = await api.put<SewingLineSchematic>(`/production/schematics/${schematicId}`, data);
    return response.data;
  },

  getWorkers: async (params?: { skip?: number; limit?: number; active_only?: boolean }): Promise<Worker[]> => {
    const response = await api.get<Worker[]>('/production/workers', { params });
    return response.data;
  },

  getWorkerById: async (workerId: number): Promise<Worker> => {
    const response = await api.get<Worker>(`/production/workers/${workerId}`);
    return response.data;
  },

  createWorker: async (data: WorkerCreate): Promise<Worker> => {
    const response = await api.post<Worker>('/production/workers', data);
    return response.data;
  },

  updateWorker: async (workerId: number, data: WorkerUpdate): Promise<Worker> => {
    const response = await api.put<Worker>(`/production/workers/${workerId}`, data);
    return response.data;
  },

  getWorkerGroups: async (params?: { skip?: number; limit?: number }): Promise<WorkerGroup[]> => {
    const response = await api.get<WorkerGroup[]>('/production/worker-groups', {
      params,
    });
    return response.data;
  },

  createWorkerGroup: async (data: WorkerGroupCreate): Promise<WorkerGroup> => {
    const response = await api.post<WorkerGroup>('/production/worker-groups', data);
    return response.data;
  },

  updateWorkerGroup: async (groupId: number, data: WorkerGroupUpdate): Promise<WorkerGroup> => {
    const response = await api.put<WorkerGroup>(`/production/worker-groups/${groupId}`, data);
    return response.data;
  },

  getStages: async (): Promise<StageOption[]> => {
    const response = await api.get<StageOption[]>('/production/stages');
    return response.data;
  },

  getAssignments: async (assignmentDate: string): Promise<DailyAssignmentResponse[]> => {
    const response = await api.get<DailyAssignmentResponse[]>('/production/assignments', {
      params: { assignment_date: assignmentDate },
    });
    return response.data;
  },

  createAssignment: async (data: DailyAssignmentCreate): Promise<DailyAssignmentResponse> => {
    const response = await api.post<DailyAssignmentResponse>('/production/assignments', data);
    return response.data;
  },

  createReworkBatch: async (data: ReworkBatchCreate): Promise<ReworkBatchResponse> => {
    const response = await api.post<ReworkBatchResponse>('/production/rework/batches', data);
    return response.data;
  },

  getReworkBatches: async (params?: { source_batch_id?: number; printed?: boolean }): Promise<ReworkBatchResponse[]> => {
    const response = await api.get<ReworkBatchResponse[]>('/production/rework/batches', { params });
    return response.data;
  },

  updateReworkBatch: async (reworkBatchId: number, data: ReworkBatchUpdate): Promise<ReworkBatchResponse> => {
    const response = await api.patch<ReworkBatchResponse>(`/production/rework/batches/${reworkBatchId}`, data);
    return response.data;
  },


  getMaxProductionQuantity: async (
    dailyAssignmentId: number,
    barcode: string,
    trackingDate?: string | null
  ): Promise<MaxProductionQuantityResponse> => {
    const response = await api.get<MaxProductionQuantityResponse>('/production/tracking/max-quantity', {
      params: {
        daily_assignment_id: dailyAssignmentId,
        barcode,
        ...(trackingDate != null && trackingDate !== '' ? { tracking_date: trackingDate } : {}),
      },
    });
    return response.data;
  },

  recordProduction: async (data: RecordProductionRequest): Promise<RecordProductionResponse> => {
    const response = await api.post<RecordProductionResponse>('/production/tracking/record', data);
    return response.data;
  },


  getPhaseDailyProduction: async (
    phaseId: number,
    targetDate: string,
  ): Promise<PhaseDailyProduction> => {
    const response = await api.get<PhaseDailyProduction>('/production/phase-daily-production', {
      params: { phase_id: phaseId, target_date: targetDate },
    });
    return response.data;
  },

  getPhaseExpectedWorkRange: async (
    phaseId: number,
    fromDate: string,
    toDate: string,
  ): Promise<PhaseExpectedWorkRange> => {
    const response = await api.get<PhaseExpectedWorkRange>('/production/phase-expected-work-range', {
      params: { phase_id: phaseId, date_from: fromDate, date_to: toDate },
    });
    return response.data;
  },

  getPhaseSchematicWorkRange: async (
    phaseId: number,
    fromDate: string,
    toDate: string,
  ): Promise<PhaseSchematicWorkRangeResponse> => {
    const response = await api.get<PhaseSchematicWorkRangeResponse>(
      '/production/phase-schematic-work-range',
      {
        params: { phase_id: phaseId, date_from: fromDate, date_to: toDate },
      }
    );
    return response.data;
  },

  getSchematicWorkerBreakdown: async (
    schematicId: number,
    fromDate: string,
    toDate: string,
  ): Promise<SchematicWorkerBreakdownResponse> => {
    const response = await api.get<SchematicWorkerBreakdownResponse>(
      `/production/schematics/${schematicId}/worker-breakdown`,
      {
        params: { date_from: fromDate, date_to: toDate },
      }
    );
    return response.data;
  },

  getSewingSchematicDailyProduction: async (
    fromDate: string,
    toDate: string
  ): Promise<SchematicDailyProductionRecord[]> => {
    const response = await api.get<SchematicDailyProductionRecord[]>(
      '/production/sewing/schematic-daily-production',
      {
        params: { date_from: fromDate, date_to: toDate },
      }
    );
    return response.data;
  },

  getWorkersProductionBreakdown: async (
    fromDate: string,
    toDate: string,
  ): Promise<AllWorkersProductionBreakdownResponse> => {
    const response = await api.get<AllWorkersProductionBreakdownResponse>(
      '/production/workers/breakdown',
      {
        params: { date_from: fromDate, date_to: toDate },
      }
    );
    return response.data;
  },

  createOvertimeRequest: async (
    data: WorkerOvertimeRequestCreate
  ): Promise<WorkerOvertimeRequestResponse> => {
    const response = await api.post<WorkerOvertimeRequestResponse>('/production/overtime/requests', data);
    return response.data;
  },

  getPendingOvertimeRequests: async (): Promise<WorkerOvertimePendingRequest[]> => {
    const response = await api.get<WorkerOvertimePendingRequest[]>('/production/overtime/requests/pending');
    return response.data;
  },

  approveOvertimeRequest: async (
    requestId: number,
    admin_comment?: string | null
  ): Promise<WorkerOvertimeRequestResponse> => {
    const response = await api.post<WorkerOvertimeRequestResponse>(
      `/production/overtime/requests/${requestId}/approve`,
      { admin_comment: admin_comment ?? null }
    );
    return response.data;
  },

  rejectOvertimeRequest: async (
    requestId: number,
    admin_comment?: string | null
  ): Promise<WorkerOvertimeRequestResponse> => {
    const response = await api.post<WorkerOvertimeRequestResponse>(
      `/production/overtime/requests/${requestId}/reject`,
      { admin_comment: admin_comment ?? null }
    );
    return response.data;
  },
};

export default api; 