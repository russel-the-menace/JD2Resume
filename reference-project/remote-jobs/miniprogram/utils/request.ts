// miniprogram/utils/request.ts

import { StatusCode } from './statusCodes';

const BASE_URL = 'https://feiwan.online/api';
const HOST_URL = 'https://feiwan.online';

export const formatFileUrl = (url: string | undefined): string => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/public')) return `${HOST_URL}${url}`;
  return url;
};

export interface IApiResponse<T = any> {
  success: boolean;
  code?: StatusCode;
  result: T; // Change 'data' to 'result' to avoid confusion with wx response.data
  message?: string;
}

export const request = <T = any>(options: WechatMiniprogram.RequestOption, retries = 2): Promise<T> => {
  return new Promise((resolve, reject) => {
    // 获取本地存储的身份标识
    const openid = wx.getStorageSync('user_openid');
    const token = wx.getStorageSync('token');
    const url = options.url.startsWith('http') ? options.url : `${BASE_URL}${options.url}`;

    wx.request({
      ...options,
      url,
      timeout: 15000, // 增加超时时间到 15 秒
      header: {
        'content-type': 'application/json',
        'x-openid': openid || '',
        'Authorization': token ? `Bearer ${token}` : '',
        ...options.header,
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
        } else {
          // Construct a proper Error object from the response
          const errorData = res.data as any;
          const errorMessage = errorData?.message || `Request failed with status ${res.statusCode}`;
          const error = new Error(errorMessage);
          (error as any).data = errorData;
          (error as any).statusCode = res.statusCode;
          reject(error);
        }
      },
      fail: (err) => {
        if (retries > 0) {
          console.warn(`[Network] Connection failed for ${url}. Retrying... (${retries} attempts left)`);
          setTimeout(() => {
             request<T>(options, retries - 1).then(resolve).catch(reject);
          }, 1000); // Wait 1s before retry
        } else {
          reject(err);
        }
      }
    });
  });
};

/**
 * Helper to call standard backend APIs
 */
export const callApi = async <T = any>(name: string, data: any = {}): Promise<IApiResponse<T>> => {
  // Automatic login if openid is missing (and not already doing login)
  if (name !== 'login' && !wx.getStorageSync('user_openid')) {
    console.log(`[API] Triggering auto-login for ${name}...`);
    try {
      await performLogin();
    } catch (err) {
      console.error('[API] Auto login error:', err);
      // 如果登录失败，返回一个错误，而不是继续请求
      return { success: false, message: 'Login failed' } as any;
    }
  }

  try {
    return await request<IApiResponse<T>>({
      url: `/${name}`,
      method: 'POST',
      data,
    });
  } catch (error: any) {
    if (error.statusCode === 401) {
      console.warn(`[API] ${name} returned 401. Clearing tokens and cache...`);
      wx.removeStorageSync('token');
      wx.removeStorageSync('user_openid');
      wx.removeStorageSync('user_cache');  // 清除本地用户缓存，确保重新登录
      
      // 可以根据需要跳转到登录页，但通常静默登录更好
      // 这里我们尝试静默登录一次并重试
      if (name !== 'login') {
         console.log(`[API] Attempting re-login and retry for ${name}...`);
         try {
           await performLogin();
           return await request<IApiResponse<T>>({
              url: `/${name}`,
              method: 'POST',
              data,
            });
         } catch (reLoginError) {
           console.error('[API] Re-login retry failed:', reLoginError);
         }
      }
    }
    throw error;
  }
};

let loginPromise: Promise<string> | null = null;

/**
 * Standard WeChat login flow to get real openid
 * Implements Singleton pattern to prevent concurrent logins
 */
export const performLogin = (): Promise<string> => {
  if (loginPromise) {
    return loginPromise;
  }

  loginPromise = new Promise((resolve, reject) => {
    // Check storage one last time inside the promise to be safe
    const existing = wx.getStorageSync('user_openid');
    if (existing) {
      loginPromise = null;
      return resolve(existing);
    }

    wx.login({
      success: async (res) => {
        if (res.code) {
          try {
            // Call our own backend to exchange code for openid
            const loginRes = await request<IApiResponse<any>>({
              url: '/login',
              method: 'POST',
              data: { code: res.code }
            });

            const openid = loginRes?.result?.openid;
            if (openid) {
              wx.setStorageSync('user_openid', openid);
              // Update app global data if possible
              const app = getApp<IAppOption>();
              if (app?.globalData) {
                app.globalData.user = loginRes?.result?.user;
              }
              resolve(openid);
            } else {
              reject(new Error('Login failed: no openid returned'));
            }
          } catch (err) {
            reject(err);
          } finally {
            loginPromise = null;
          }
        } else {
          loginPromise = null;
          reject(new Error('wx.login failed: ' + res.errMsg));
        }
      },
      fail: (err) => {
        loginPromise = null;
        reject(err);
      }
    });
  });

  return loginPromise;
};

/**
 * Helper to upload files to the backend
 */
export const uploadApi = async <T = any>(options: {
  url: string;
  filePath: string;
  name?: string;
  formData?: any;
}): Promise<T> => {
  const { url, filePath, name = 'file', formData = {} } = options;
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  
  const performUpload = (): Promise<T> => {
    return new Promise((resolve, reject) => {
      const openid = wx.getStorageSync('user_openid');
      const token = wx.getStorageSync('token');

      wx.uploadFile({
        url: fullUrl,
        filePath,
        name,
        formData,
        header: {
          'x-openid': openid || '',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(res.data) as T);
            } catch (err) {
              reject(new Error('Failed to parse response'));
            }
          } else {
            const error = new Error(`Upload failed with status ${res.statusCode}`);
            (error as any).statusCode = res.statusCode;
            (error as any).data = res.data;
            reject(error);
          }
        },
        fail: (err) => reject(err),
      });
    });
  };

  try {
    return await performUpload();
  } catch (error: any) {
    if (error.statusCode === 401) {
      console.warn('[Upload] 401 detected, retrying after login...');
      wx.removeStorageSync('token');
      wx.removeStorageSync('user_cache');
      await performLogin();
      return await performUpload();
    }
    throw error;
  }
};

export const testRequest = async () => {
  try {
    console.log('Testing backend request to /jobs...');
    const data = await request({
      url: '/jobs',
      method: 'GET'
    });
    console.log('Backend request success:', data);
    return data;
  } catch (err) {
    console.error('Backend request failed:', err);
    throw err;
  }
};
