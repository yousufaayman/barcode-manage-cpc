import axios from 'axios';

// Use environment variable if available, otherwise use relative URL
const API_URL = '/api/v1';

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

// Add a response interceptor for debugging
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
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
  role: 'Admin' | 'Cutting' | 'Sewing' | 'Packaging' | 'Creator';
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
  brand_name: string;
  model_name: string;
  size_value: string;
  color_name: string;
  quantity: number;
  layers: number;
  serial: number;
  phase_name: string;
  current_phase: number;
  status: string;
  archived_at?: string | null;
}

export interface BarcodeListResponse {
  items: BarcodeData[];
  total: number;
}

export interface BarcodeUpdate {
  current_phase?: number;
  status?: string;
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

export interface PhaseStats {
  cutting: PhaseStatusStats;
  sewing: PhaseStatusStats;
  packaging: PackagingStats;
}

// Types for Advanced Statistics Page
export interface TurnoverRateByPhase {
  phase_id: number;
  phase_name: string;
  average_minutes: number;
}

export interface TurnoverStat {
  batch_id?: number;
  phase_id: number;
  phase_name: string;
  duration_minutes?: number;
  average_minutes?: number;
}

export interface StatusDistribution {
  status: string;
  count: number;
}

export interface WIPStat {
  phase_id: number;
  phase_name: string;
  pending: number;
  in_progress: number;
  completed: number;
}

export interface WIPByBrandStat {
  brand_id: number;
  brand_name: string;
  pending: number;
  in_progress: number;
  completed: number;
  total: number;
}

export interface WorkingPhaseByBrandStat {
  brand_id: number;
  brand_name: string;
  phase_id: number;
  phase_name: string;
  pending: number;
  in_progress: number;
  completed: number;
  total: number;
}

export interface WorkingPhaseByModelStat {
  model_id: number;
  model_name: string;
  brand_id: number;
  brand_name: string;
  phase_id: number;
  phase_name: string;
  pending: number;
  in_progress: number;
  completed: number;
  total: number;
}

export interface AdvancedStatisticsResponse {
  turnover_rate_by_phase: TurnoverRateByPhase[];
  slowest_turnover: TurnoverRateByPhase | null;
  fastest_turnover: TurnoverRateByPhase | null;
  bottleneck_phase: TurnoverRateByPhase | null;
  status_distribution: StatusDistribution[];
  average_batch_size: number;
  current_wip: WIPStat[];
  wip_by_brand: WIPByBrandStat[];
  working_phase_by_brand: WorkingPhaseByBrandStat[];
  working_phase_by_model: WorkingPhaseByModelStat[];
  // Add other stats as they are implemented
  [key: string]: any; // Allow other properties for now
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
}

export interface JobOrder {
  job_order_id: number;
  model_id: number;
  job_order_number: string;
  model_name?: string;
  items: JobOrderItem[];
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

export interface JobOrderUpdate {
  model_id?: number;
  job_order_number?: string;
  items?: {
    color_id: number;
    size_id: number;
    quantity: number;
  }[];
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

export interface JobOrderListResponse {
  items: JobOrder[];
  total: number;
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

  deleteUser: async (userId: number): Promise<User> => {
    const response = await api.delete<User>(`/auth/users/${userId}`);
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
    brand?: string;
    model?: string;
    size?: string;
    color?: string;
    phase?: string;
    status?: string;
    archived?: boolean;
  }): Promise<BarcodeListResponse> => {
    const response = await api.get<BarcodeListResponse>('/batches/', { params });
    return response.data;
  },

  getBarcodeStats: async (): Promise<BatchStats> => {
    const response = await api.get<BatchStats>('/batches/stats');
    return response.data;
  },

  getPhaseStats: async (): Promise<PhaseStats> => {
    const response = await api.get<PhaseStats>('/batches/phase-stats');
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
  }
};

export const jobOrderApi = {
  getAll: async (): Promise<JobOrder[]> => {
    const response = await api.get('/job-orders/');
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

  update: async (id: number, jobOrder: JobOrderUpdate): Promise<JobOrder> => {
    const response = await api.put(`/job-orders/${id}`, jobOrder);
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
  }
};

export default api; 