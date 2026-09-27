import React from 'react';

/**
 * 教师列表骨架屏 (同时支持桌面端双列与移动端单列)
 */
export const TeacherListSkeleton: React.FC<{
  layout?: 'desktop' | 'mobile';
  count?: number;
}> = ({ layout = 'desktop', count = 4 }) => {
  const items = Array.from({ length: count });

  if (layout === 'mobile') {
    return (
      <div className="space-y-3 animate-pulse" aria-label="正在加载教师列表">
        {items.map((_, idx) => (
          <div
            key={idx}
            className="p-3.5 bg-white rounded-2xl border border-gray-100/90 shadow-2xs space-y-2.5"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2.5">
                {/* Avatar skeleton */}
                <div className="w-10 h-10 rounded-xl bg-gray-200 shrink-0" />
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-16 bg-gray-200 rounded-md" />
                    <div className="h-3 w-10 bg-gray-150 bg-gray-100 rounded-md" />
                  </div>
                  <div className="h-3 w-28 bg-gray-100 rounded-md" />
                </div>
              </div>
              {/* Score pill skeleton */}
              <div className="h-6 w-14 bg-amber-50 rounded-lg border border-amber-100/60" />
            </div>

            {/* Courses pills */}
            <div className="flex gap-1.5 pt-1">
              <div className="h-4 w-14 bg-gray-100 rounded-md" />
              <div className="h-4 w-18 bg-gray-100 rounded-md" />
              <div className="h-4 w-12 bg-gray-100 rounded-md" />
            </div>

            {/* Dimension badges */}
            <div className="grid grid-cols-3 gap-1 pt-1 border-t border-gray-50">
              <div className="h-5 bg-gray-50 rounded-md" />
              <div className="h-5 bg-gray-50 rounded-md" />
              <div className="h-5 bg-gray-50 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Desktop 2-column layout
  return (
    <div className="grid grid-cols-2 gap-4 animate-pulse" aria-label="正在加载教师列表">
      {items.map((_, idx) => (
        <div
          key={idx}
          className="bg-white p-5 rounded-3xl border border-gray-100 shadow-2xs space-y-3.5 flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3.5">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-2xl bg-indigo-50/70 border border-indigo-100/40 shrink-0" />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-20 bg-gray-200 rounded-md" />
                    <div className="h-3.5 w-12 bg-gray-100 rounded-md" />
                    <div className="h-4 w-16 bg-emerald-50 rounded-full border border-emerald-100/50" />
                  </div>
                  <div className="h-3.5 w-36 bg-gray-100 rounded-md" />
                </div>
              </div>
              {/* Score pill */}
              <div className="h-7 w-16 bg-amber-50 rounded-xl border border-amber-100" />
            </div>

            {/* Course tags */}
            <div className="flex gap-1.5 pt-1">
              <div className="h-5 w-16 bg-gray-100 rounded-lg" />
              <div className="h-5 w-24 bg-gray-100 rounded-lg" />
              <div className="h-5 w-20 bg-gray-100 rounded-lg" />
            </div>
          </div>

          {/* Rating dimensions row */}
          <div className="pt-2 border-t border-gray-50 grid grid-cols-3 gap-2">
            <div className="h-6 bg-gray-50 rounded-lg" />
            <div className="h-6 bg-gray-50 rounded-lg" />
            <div className="h-6 bg-gray-50 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * 学生评价列表骨架屏 (用于教师详情弹窗等)
 */
export const ReviewListSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  const items = Array.from({ length: count });

  return (
    <div className="space-y-3 animate-pulse" aria-label="正在加载评价列表">
      {items.map((_, idx) => (
        <div
          key={idx}
          className="p-4 bg-gray-50/80 rounded-2xl border border-gray-100 space-y-2.5"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-4 w-16 bg-gray-200 rounded-md" />
              <div className="h-3 w-12 bg-gray-100 rounded-md" />
              <div className="h-3 w-16 bg-gray-100 rounded-md" />
            </div>
            <div className="h-5 w-14 bg-amber-100/70 rounded-full" />
          </div>

          {/* Six dimension score tags */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <div className="h-5 w-16 bg-indigo-50/70 rounded-md" />
            <div className="h-5 w-16 bg-indigo-50/70 rounded-md" />
            <div className="h-5 w-16 bg-indigo-50/70 rounded-md" />
            <div className="h-5 w-16 bg-indigo-50/70 rounded-md" />
          </div>

          {/* Review text */}
          <div className="space-y-1.5 py-1">
            <div className="h-3.5 w-full bg-gray-200/70 rounded-md" />
            <div className="h-3.5 w-4/5 bg-gray-200/70 rounded-md" />
          </div>

          {/* Footer bar */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-100/60">
            <div className="h-3 w-28 bg-gray-100 rounded-md" />
            <div className="h-6 w-12 bg-gray-100 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
};
