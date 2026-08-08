// miniprogram/utils/fileCache.ts
const fs = wx.getFileSystemManager();
const CACHE_KEY_PREFIX = 'img_cache_';
// 简单的内存缓存，避免同一次 session 多次读取 storage
const memoryCache: Record<string, string> = {};

/**
 * 智能图片缓存：网络图片 -> 本地文件
 * 1. 检查 Storage 是否有映射的本地路径
 * 2. 检查本地文件是否真实存在
 * 3. 存在则返回本地路径 (秒开)
 * 4. 不存在则下载 -> 保存 -> 更新 Storage -> 返回本地路径
 * 5. 失败则降级返回原 URL
 */
export const cacheImage = (url: string): Promise<string> => {
    return new Promise((resolve) => {
        if (!url || !url.startsWith('http')) {
            resolve(url || ''); // 非网络图片直接返回
            return;
        }

        // 归一化 Key（去掉 query 防止重复下载）
        // 但要注意：如果你的头像通过 query 区分版本（如 ?t=123），则不能去掉
        const cacheKey = `${CACHE_KEY_PREFIX}${url}`;
        
        // Level 0: Memory Cache
        if (memoryCache[url]) {
             resolve(memoryCache[url]);
             return;
        }

        const cachedPath = wx.getStorageSync(cacheKey);

        // Level 1: Disk Cache
        if (cachedPath) {
            try {
                // 同步检查文件存在性 (非常快)
                fs.accessSync(cachedPath);
                // console.log('[ImageCache] Hit:', cachedPath); // Debug off to reduce noise
                memoryCache[url] = cachedPath;
                resolve(cachedPath);
                return;
            } catch (e) {
                // 文件不存在（可能被微信清理了），移除失效的 Storage 记录
                console.warn('[ImageCache] Stale cache detected, removing:', cachedPath);
                wx.removeStorageSync(cacheKey);
            }
        }

        // Level 2: Network Download
        // console.log('[ImageCache] Downloading:', url);
        wx.downloadFile({
            url,
            success: (res) => {
                if (res.statusCode === 200) {
                    fs.saveFile({
                        tempFilePath: res.tempFilePath,
                        success: (saveRes) => {
                            const savedPath = saveRes.savedFilePath;
                            wx.setStorageSync(cacheKey, savedPath);
                            memoryCache[url] = savedPath;
                            // console.log('[ImageCache] Saved:', savedPath);
                            resolve(savedPath);
                        },
                        fail: (err) => {
                            console.error('[ImageCache] Save failed:', err);
                            resolve(url); // 保存失败，降级使用网络 URL
                        }
                    });
                } else {
                    resolve(url);
                }
            },
            fail: (err) => {
                console.error('[ImageCache] Download failed:', err);
                resolve(url);
            }
        });
    });
};

/**
 * 清理所有图片缓存 (用于退出登录或清理空间)
 */
export const clearImageCache = () => {
    try {
        const keys = wx.getStorageInfoSync().keys;
        keys.forEach(key => {
            if (key.startsWith(CACHE_KEY_PREFIX)) {
                const path = wx.getStorageSync(key);
                try {
                    fs.unlinkSync(path); // 删除真实文件
                } catch(e) {}
                wx.removeStorageSync(key); // 删除引用
            }
        });
        // 清空内存引用
        for (const k in memoryCache) delete memoryCache[k];
        console.log('[ImageCache] All caches cleared.');
    } catch (e) {
        console.error('[ImageCache] Clear failed', e);
    }
}
