import axios from 'axios';

// Use environment variable if available, otherwise use relative URL
const API_URL = process.env.REACT_APP_API_URL || '/api/v1';

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
    // Log the full URL being requested for debugging
    console.log('API Request URL:', config.baseURL + config.url);
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
  role: 'Admin' | 'Cutting' | 'Sewing' | 'Packaging';
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
  // Debug function to test API configuration
  debug: () => {
    console.log('API Base URL:', API_URL);
    console.log('Environment REACT_APP_API_URL:', process.env.REACT_APP_API_URL);
    return { baseURL: API_URL, env: process.env.REACT_APP_API_URL };
  },

  scanBarcode: async (barcode: string): Promise<BarcodeData> => {
    const response = await api.get<BarcodeData>(`/batches/barcode/${barcode}`);
    return response.data;
  },

  updateBarcode: async (barcode: string, updateData: BarcodeUpdate): Promise<BarcodeData> => {
    const response = await api.put<BarcodeData>(`/batches/barcode/${barcode}`, updateData);
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

  getBarcodesByPhase: async (phase: string, status: string, limit: number = 10): Promise<BarcodeListResponse> => {
    const response = await api.get<BarcodeListResponse>(`/batches`, {
      params: {
        phase,
        status,
        limit
      }
    });
    return response.data;
  },
};

export default api; 