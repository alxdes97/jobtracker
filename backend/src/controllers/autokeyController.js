import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { AutoKeyNotice } from '../models/AutoKeyNotice.js';
import { AutoKeyConfig } from '../models/AutoKeyConfig.js';
import { ApiError, asyncHandler } from '../utils/apiError.js';
import { HORIZON_MS, describeReminder } from '../utils/autokeySchedule.js';
import { exportAutoKeyConfig, normalizeAutoKeyConfig, publicAutoKeyConfig } from '../utils/autokeyConfig.js';

function upcomingInterviews(jobs, now) {
  const until = now.getTime() + HORIZON_MS;
  const found = [];
  for (const job of jobs) {
    const interviews = job.interviews || [];
    for (let index = 0; index < interviews.length; index += 1) {
      const interview = interviews[index];
      if (!interview.startsAt) continue;
      const start = new Date(interview.startsAt);
      const time = start.getTime();
      if (Number.isNaN(time) || time <= now.getTime() || time > until) continue;
      found.push({ job, interview, step: index + 1, start });
    }
  }
  return found;
}

export const listReminders = asyncHandler(async (req, res) => {
  const now = new Date();
  const jobs = await Job.find({ user: req.user._id, archived: false }).select(
    'title companyName interviews',
  );
  const candidates = upcomingInterviews(jobs, now);
  const ids = candidates.map((item) => item.interview._id);
  const notices = ids.length
    ? await AutoKeyNotice.find({ user: req.user._id, interview: { $in: ids } })
    : [];
  const lastByInterview = new Map(
    notices.map((notice) => [String(notice.interview), notice.lastNotifiedAt]),
  );
  const upcoming = candidates
    .map((item) =>
      describeReminder(item, now, lastByInterview.get(String(item.interview._id)) || null),
    )
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  res.json({
    now: now.toISOString(),
    upcoming,
    due: upcoming.filter((item) => item.due),
  });
});

export const ackReminders = asyncHandler(async (req, res) => {
  const ids = req.body?.interviewIds;
  if (!Array.isArray(ids)) throw ApiError.badRequest('interviewIds must be a list');
  const requested = [...new Set(ids.map((id) => String(id)))].slice(0, 50);
  const valid = requested.filter((id) => mongoose.isValidObjectId(id));
  if (!valid.length) {
    res.json({ acknowledged: [] });
    return;
  }

  const jobs = await Job.find({
    user: req.user._id,
    'interviews._id': { $in: valid },
  }).select('interviews._id');
  const owned = [];
  for (const job of jobs) {
    for (const interview of job.interviews) {
      const id = String(interview._id);
      if (valid.includes(id)) owned.push(id);
    }
  }
  const now = new Date();
  await Promise.all(
    owned.map((id) =>
      AutoKeyNotice.updateOne(
        { user: req.user._id, interview: id },
        { $set: { lastNotifiedAt: now, user: req.user._id, interview: id } },
        { upsert: true },
      ),
    ),
  );
  res.json({ acknowledged: owned });
});

async function readConfig(userId) {
  const doc = await AutoKeyConfig.findOne({ user: userId });
  return publicAutoKeyConfig(doc);
}

async function writeConfig(userId, body) {
  const config = normalizeAutoKeyConfig(body);
  const doc = await AutoKeyConfig.findOneAndUpdate(
    { user: userId },
    {
      user: userId,
      bindings: config.bindings,
      clipboardTransform: {
        enabled: config.clipboard_transform.enabled,
        pairs: config.clipboard_transform.pairs,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return publicAutoKeyConfig(doc);
}

export const getConfig = asyncHandler(async (req, res) => {
  res.json(await readConfig(req.user._id));
});

export const saveConfig = asyncHandler(async (req, res) => {
  res.json(await writeConfig(req.user._id, req.body));
});

export const exportConfig = asyncHandler(async (req, res) => {
  const config = await readConfig(req.user._id);
  res.set('Content-Disposition', 'attachment; filename="autokey-config.json"');
  res.json(exportAutoKeyConfig(config));
});

export const importConfig = asyncHandler(async (req, res) => {
  res.json(await writeConfig(req.user._id, req.body));
});
