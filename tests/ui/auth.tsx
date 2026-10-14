// Local fixture only: exercise the real App and audit dialog without cloud reads/writes.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import { supabaseService as service } from '../../src/services/supabaseService';
import '../../src/index.css';

let callback: (event: string, session: any) => void;
let user = { id: 'fixture-admin', email: 'admin@example.test', user_metadata: { nickname: '测试管理员' } };
const fixture = {
  pointsCalls: 0, currentUserCalls: 0, adminCalls: 0, balance: 73,
  adminMode: 'allowed', holdPoints: false, pending: [] as Array<() => void>,
  emit(event: string, id = user.id) {
    user = { ...user, id };
    callback(event, event === 'SIGNED_OUT' ? null : { user: { ...user } });
  },
  release() { fixture.pending.splice(0).forEach(resolve => resolve()); },
  changed() { reviewChanged(); },
};
let reviewChanged = () => {};
(window as any).authFixture = fixture;
service.getTeachersPage = async () => ({ items: [], total: 0 });
service.getColleges = async () => [];
service.getReviews = async () => [];
service.getReviewsPage = async () => ({ items: [], total: 0 });
service.getReviewCounts = async () => ({ pending: 0, approved: 0, rejected: 0 });
service.getMyLikedReviewIds = async () => [];
service.subscribeToReviews = handler => { reviewChanged = handler; return { unsubscribe() {} }; };
service.getCurrentUser = async () => { fixture.currentUserCalls++; return user as any; };
service.onAuthStateChange = handler => {
  callback = handler;
  queueMicrotask(() => handler('INITIAL_SESSION', { user }));
  return { data: { subscription: { unsubscribe() {} } } } as any;
};
service.checkIsAdmin = async () => {
  fixture.adminCalls++;
  if (fixture.adminMode === 'error') return { isAdmin: false, error: '管理员权限校验失败，请检查网络后重试。' };
  if (fixture.adminMode === 'denied') return { isAdmin: false };
  return { isAdmin: true, role: 'super_admin' };
};
service.getUserPoints = async () => {
  fixture.pointsCalls++;
  const points = fixture.balance;
  if (fixture.holdPoints) await new Promise<void>(resolve => fixture.pending.push(resolve));
  return { points, transactions: [], hasCheckedInToday: false };
};
createRoot(document.getElementById('root')!).render(<App />);
