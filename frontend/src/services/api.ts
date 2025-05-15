import axios from 'axios';

const API_URL = 'http://192.168.1.9:8000/api/v1';

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

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface User {
  user_id: number;
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
};

export default api; 