import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../../db';
import { ensureUser } from '../../userUtils';
import { runBackgroundTask, TaskServices } from '../../taskRunner';
import { GenerateFromFrontendRequest } from '../../types';
import { StatusCode, StatusMessage } from '../../constants/statusCodes';
import { validateGenerationInput } from '../../utils/generationValidation';

const router = Router();
const COLLECTION_RESUMES = 'generated_resumes';

/**
 * 生成简历 PDF API
 * POST /api/generate
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const payload = req.body as GenerateFromFrontendRequest;

    const validation = validateGenerationInput(payload);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_GENERATION_INPUT',
        message: '生成前校验未通过',
        errors: validation.errors,
      });
    }
    
    // 使用 JWT 鉴权通过后的手机号
    const phoneNumber = (req as any).user.phoneNumber;

    if (!phoneNumber) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Missing phoneNumber' });
    }

    const db = getDb();
    if (!db) {
      return res.status(500).json({ error: '数据库未就绪' });
    }

    // --- Concurrent Task Check Start ---
    const existingTask = await db.collection(COLLECTION_RESUMES).findOne({
      phoneNumber: phoneNumber,
      jobId: payload.jobId,
      status: 'processing'
    });

    if (existingTask) {
      // 检查任务是否已经超过 10 分钟 (僵死检查)
      const taskAgeMinutes = (Date.now() - new Date(existingTask.createTime).getTime()) / (1000 * 60);
      if (taskAgeMinutes > 10) {
        console.log(`⚠️ 发现僵死任务 ${existingTask.task_id} (已持续 ${taskAgeMinutes.toFixed(1)} 分钟)，自动清理。`);
        await db.collection(COLLECTION_RESUMES).updateOne(
          { _id: existingTask._id }, 
          { $set: { status: 'failed', error: 'Task Timeout (Auto Cleaned)' } }
        );
      }
      // 注意：根据用户要求（1分钟内发起多次生成并排队），此处不再返回 409 拦截，
      // 而是允许新任务进入队列。p-limit(2) 会在后台保证同时运行的任务数受控。
    }
    // --- Concurrent Task Check End ---

    // --- Quota Check Start ---
    const usersCol = db.collection('users');
    const user = await usersCol.findOne({ phone: phoneNumber });

    if (!user) {
      return res.status(500).json({ error: '无法通过用户校验' });
    }

    const membership = (user as any).membership || {};
    const quota = membership.pts_quota || { limit: 0, used: 0 };
    const topupBalance = membership.topup_quota || 0;
    const now = new Date();
    const isMemberActive = membership.expire_at && new Date(membership.expire_at) > now;

    let consumedType = '';
    const isPaid = payload.is_paid === true;

    if (isPaid) {
      console.log(`[Generate] Quota skipped for paid task (Screenshot Parse).`);
      consumedType = 'skipped';
    } else if (isMemberActive && quota.used < quota.limit) {
      // Use Monthly Quota
      consumedType = 'monthly';
      await usersCol.updateOne(
        { _id: user._id },
        { $inc: { 'membership.pts_quota.used': 1 } }
      );
    } else if (topupBalance > 0) {
      // Use Top-up Quota
      consumedType = 'topup';
      await usersCol.updateOne(
        { _id: user._id },
        { $inc: { 'membership.topup_quota': -1 } }
      );
    } else {
      // Quota Exhausted
      return res.status(StatusCode.HTTP_FORBIDDEN).json({ 
        success: false,
        code: StatusCode.QUOTA_EXHAUSTED,
        message: StatusMessage[StatusCode.QUOTA_EXHAUSTED]
      });
    }
    // --- Quota Check End ---

    // 1. 生成唯一 Task ID
    const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const taskId = `RESUME_${dateStr}_${randomUUID().slice(0, 8)}`;
    // Each generation is a separate application evidence record, even when
    // the same job is regenerated in another language or from a new profile.
    const applicationId = `APP_${dateStr}_${randomUUID().slice(0, 12)}`;

    // 2. 预先入库（立即执行）
    console.log(`📡 正在创建任务: ${taskId}`);
    await db.collection(COLLECTION_RESUMES).insertOne({
      phoneNumber: phoneNumber,
      openid: user.openid, // Keep openid for reference
      task_id: taskId,
      applicationId,
      evidenceVersion: 1,
      status: 'processing',
      consumedType: consumedType, // 记录消耗类型用于异常退回
      jobTitle: payload.job_data.title,
      jobTitle_cn: payload.job_data.title_chinese,
      jobTitle_en: payload.job_data.title_english,
      company: payload.job_data.team,
      jobId: payload.jobId,
      language: payload.language,
      createTime: new Date(),
      resumeInfo: payload.resume_profile,
      jobData: payload.job_data,
      jobSnapshot: payload.job_data,
      resumeProfileSnapshot: payload.resume_profile,
      generationInput: {
        jobId: payload.jobId,
        language: payload.language,
        applicationId,
      }
    });

    // 3. 开启异步后台任务
    const services: TaskServices = { db };
    runBackgroundTask(taskId, payload, services);

    // 4. 立即返回 TaskID 给前端
    res.json({
      success: true,
      result: {
        task_id: taskId,
        application_id: applicationId,
        status: 'processing'
      }
    });

  } catch (error: any) {
    console.error('提交任务失败:', error);
    res.status(500).json({
      success: false,
      error: '任务提交失败',
      message: error.message,
    });
  }
});

export default router;
