import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9001/api/v1';

class ApiClient {
  private instance: AxiosInstance;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: any) => void;
  }> = [];

  constructor() {
    this.instance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private processQueue(error: any, token: string | null = null) {
    this.failedQueue.forEach((prom) => {
      if (token) {
        prom.resolve(token);
      } else {
        prom.reject(error);
      }
    });
    this.failedQueue = [];
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

    // Response interceptor - handle 401 with refresh token
    this.instance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // If 401 and we haven't already retried this request
        if (error.response?.status === 401 && !originalRequest._retry) {
          // Don't try to refresh if the failing request was the refresh endpoint itself
          if (originalRequest.url?.includes('/auth/refresh')) {
            this.clearTokens();
            window.location.href = '/login';
            return Promise.reject(error);
          }

          if (this.isRefreshing) {
            // Queue this request while refresh is in progress
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            }).then((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return this.instance(originalRequest);
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          const refreshToken = localStorage.getItem('refreshToken');
          if (!refreshToken) {
            this.clearTokens();
            window.location.href = '/login';
            return Promise.reject(error);
          }

          try {
            const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
              refreshToken,
            });

            localStorage.setItem('accessToken', data.accessToken);
            localStorage.setItem('refreshToken', data.refreshToken);

            this.processQueue(null, data.accessToken);

            originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
            return this.instance(originalRequest);
          } catch (refreshError) {
            this.processQueue(refreshError, null);
            this.clearTokens();
            window.location.href = '/login';
            return Promise.reject(refreshError);
          } finally {
            this.isRefreshing = false;
          }
        }

        const message =
          (error.response?.data as any)?.message ||
          error.message ||
          'An error occurred';

        return Promise.reject(new Error(message));
      },
    );
  }

  private clearTokens() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
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
