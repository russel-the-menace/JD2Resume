// tests/request.test.ts
import { request } from '../miniprogram/utils/request';

// NOTE: Global wx is mocked in setup.ts

describe('Network Resilience (Frontend)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (wx.getStorageSync as jest.Mock).mockReturnValue('mock-openid');
    jest.useFakeTimers(); // Control the 1 second retry delay
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should succeed immediately if network is fine', async () => {
    (wx.request as jest.Mock).mockImplementation((opts) => {
      opts.success({ statusCode: 200, data: { ok: true } });
    });

    const res = await request({ url: '/test' });
    expect(res).toEqual({ ok: true });
    expect(wx.request).toHaveBeenCalledTimes(1);
  });

  test('should retry on network failure (fail callback) and eventually succeed', async () => {
    // 1st call: Fail
    // 2nd call: Fail
    // 3rd call: Success
    let callCount = 0;
    (wx.request as jest.Mock).mockImplementation((opts) => {
      callCount++;
      if (callCount <= 2) {
        opts.fail({ errMsg: 'request:fail timeout' });
      } else {
        opts.success({ statusCode: 200, data: { ok: true, attemts: callCount } });
      }
    });

    // Start request
    const promise = request({ url: '/flaky-endpoint' }, 3);
    
    // Fast-forward time for the retries
    // We need to advance time repeatedly because each retry sets a NEW timeout
    // 1st failure -> wait 1s -> retry
    jest.advanceTimersByTime(1000); 
    await Promise.resolve(); // flush microtasks
    
    jest.advanceTimersByTime(1000); 
    await Promise.resolve();

    const res = await promise;

    expect(res).toEqual({ ok: true, attemts: 3 });
    expect(wx.request).toHaveBeenCalledTimes(3);
  });

  test('should fail after exhausting retries', async () => {
    (wx.request as jest.Mock).mockImplementation((opts) => {
      opts.fail({ errMsg: 'request:fail offline' });
    });

    const promise = request({ url: '/offline' }, 2);

    // 1st fail -> wait 1s
    jest.advanceTimersByTime(1000);
    await Promise.resolve(); 

    // 2nd fail -> wait 1s
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    // 3rd attempt (retry strategy: 2 retries means 3 calls total? 
    // code: retries > 0 check. 
    // Call 1 (retries=2) -> Fail -> setTimeout(request(retries=1))
    // Call 2 (retries=1) -> Fail -> setTimeout(request(retries=0))
    // Call 3 (retries=0) -> Fail -> Reject
    
    jest.advanceTimersByTime(1000); // flush final
    
    await expect(promise).rejects.toEqual({ errMsg: 'request:fail offline' });
    expect(wx.request).toHaveBeenCalledTimes(3); 
  });
});
