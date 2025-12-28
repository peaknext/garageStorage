import axios, { AxiosError, AxiosInstance } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api/v1';

class ApiClient {
  private instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - add auth token
    this.instance.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor - handle errors
    this.instance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired, redirect to login
          localStorage.removeItem('accessToken');
          window.location.href = '/login';
        }

        const message =
          (error.response?.data as any)?.message ||
          error.message ||
          'An error occurred';

        return Promise.reject(new Error(message));
      },
    );
  }

  get<T>(url: string, config?: any) {
    return this.instance.get<T>(url, config);
  }

  post<T>(url: string, data?: any, config?: any) {
    return this.instance.post<T>(url, data, config);
  }

  patch<T>(url: string, data?: any, config?: any) {
    return this.instance.patch<T>(url, data, config);
  }

  delete<T>(url: string, config?: any) {
    return this.instance.delete<T>(url, config);
  }
}

export const apiClient = new ApiClient();
