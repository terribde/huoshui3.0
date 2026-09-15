import React, { useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

interface ExperienceGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'guides' | 'notices' | 'history';
}

export const ExperienceGuideModal: React.FC<ExperienceGuideModalProps> = ({
  onClose,
  defaultTab = 'guides',
}) => {
  const [activeTab, setActiveTab] = useState<'guides' | 'notices' | 'history'>(defaultTab);

  return (
    <div id="experience-guide-modal" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-xs"
      />

      <motion.div 
        id="experience-guide-content"
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.96 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative z-10 bg-white w-full max-w-lg max-h-[90vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
          <div>
            <h3 className="text-lg font-bold text-gray-900">交大知识库 & 校园动态</h3>
            <p className="text-xs text-gray-500">PRD 3.4 增量内容层 · 经验攻略与教务资讯</p>
          </div>
          <motion.button 
            id="close-experience-guide-btn"
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-gray-100 px-5 pt-2">
          <button
            onClick={() => setActiveTab('guides')}
            className={`pb-2.5 text-xs sm:text-sm font-semibold transition-colors relative mr-6 cursor-pointer ${
              activeTab === 'guides' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            经验攻略库 (保研/转专业)
            {activeTab === 'guides' && (
              <motion.div 
                layoutId="guideTabLine"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" 
              />
            )}
          </button>

          <button
            onClick={() => setActiveTab('notices')}
            className={`pb-2.5 text-xs sm:text-sm font-semibold transition-colors relative mr-6 cursor-pointer ${
              activeTab === 'notices' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            教务网公开通知
            {activeTab === 'notices' && (
              <motion.div 
                layoutId="guideTabLine"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" 
              />
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 text-xs sm:text-sm font-semibold transition-colors relative cursor-pointer ${
              activeTab === 'history' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            历史数据迁移说明
            {activeTab === 'history' && (
              <motion.div 
                layoutId="guideTabLine"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" 
              />
            )}
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'guides' && (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-800 flex items-center justify-between">
                <span>根据PRD规划：攻略库为增量二期内容，当前为精选前瞻预览。</span>
                <span className="font-bold text-amber-600">5积分 / 篇</span>
              </div>

              {/* Guide items */}
              <motion.div 
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="p-4 bg-gray-50/80 hover:bg-gray-100/80 rounded-2xl border border-gray-100 space-y-2 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                    保研综测
                  </span>
                  <span className="text-xs text-gray-400">阅读 1.2k</span>
                </div>
                <h4 className="font-bold text-sm text-gray-900">
                  【交大保研攻略】计算机与人工智能学院综测加分与夏令营全复盘
                </h4>
                <p className="text-xs text-gray-600 leading-relaxed">
                  涵盖历届推免绩点门槛、高水平竞赛认定清单（ACM/蓝桥杯/大学生数学建模）、导师套磁时间线以及往年推免复试真题集锦。
                </p>
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-gray-400">作者：21级推免直博学长</span>
                  <span className="text-indigo-600 font-medium flex items-center gap-1">
                    查看全文 <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </motion.div>

              <motion.div 
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="p-4 bg-gray-50/80 hover:bg-gray-100/80 rounded-2xl border border-gray-100 space-y-2 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                    转专业指南
                  </span>
                  <span className="text-xs text-gray-400">阅读 890</span>
                </div>
                <h4 className="font-bold text-sm text-gray-900">
                  大一新生跨大类转专业（土木/机械转计算机/电气）经验谈
                </h4>
                <p className="text-xs text-gray-600 leading-relaxed">
                  大一第一学期高数、线代平均分关键性分析；转专业笔试高频考点；面试综合素质与个人陈述准备避坑指南。
                </p>
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-gray-400">作者：交大转专业成功社团</span>
                  <span className="text-indigo-600 font-medium flex items-center gap-1">
                    查看全文 <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </motion.div>
            </div>
          )}

          {activeTab === 'notices' && (
            <div className="space-y-3">
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-800">
                教务网公开资讯同步，供同学们及时获悉选课与退改选节点（永久免费查阅）
              </div>

              <motion.div 
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="p-3.5 bg-gray-50/80 hover:bg-gray-100/80 rounded-2xl border border-gray-100 space-y-1 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-800">2024-2025学年第二学期学生正选与退选通知</span>
                  <span className="text-[10px] text-gray-400">今天</span>
                </div>
                <p className="text-xs text-gray-600">
                  正选时间：周三 10:00 至 周五 17:00，请同学们合理参考教师评价与开课时间安排。
                </p>
              </motion.div>

              <motion.div 
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="p-3.5 bg-gray-50/80 hover:bg-gray-100/80 rounded-2xl border border-gray-100 space-y-1 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-800">公共基础课（高等数学/大学物理）免修免试申请公告</span>
                  <span className="text-[10px] text-gray-400">3天前</span>
                </div>
                <p className="text-xs text-gray-600">
                  满足全国数理竞赛省一及以上获奖同学，可于教务处主页提交免修免试申请。
                </p>
              </motion.div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3 text-xs text-gray-700 leading-relaxed">
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-2">
                <h4 className="font-bold text-sm text-blue-900">PRD 4.1 旧数据迁移说明</h4>
                <p>
                  学校现有的公益性质教师评价打分网站自2024年起已两年多未更新。为了让新生与在校同学及时获取真实数据，我们进行了全面翻新，并将2024年前沉淀的历史评价完整导入迁移。
                </p>
                <div className="space-y-1 pt-1 text-blue-800">
                  <p>• <strong>能直接对应的维度</strong>（如亲和力、课程质量）：直接迁移历史分数。</p>
                  <p>• <strong>新拆分出的维度</strong>（给分松紧度 / 是否看努力）：标注「新维度持续积累中」，由全校同学最新评测共同构建。</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
