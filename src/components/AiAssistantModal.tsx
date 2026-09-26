import { formatRating, isRating, compareRatings, RATING_DIMENSIONS } from '../lib/ratings';
import { ModalFrame } from './ModalFrame';
import React, { useState, useRef, useEffect } from 'react';
import { Teacher, AiChatMessage } from '../types';
import { supabaseService } from '../services/supabaseService';
import { isSupabaseConfigured } from '../lib/supabase';
import { Bot, Send, Sparkles, User, AlertCircle, X, HelpCircle, CornerDownRight, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  teachers: Teacher[];
  userPoints: number;
  onDeductPoints: (amount: number, reason: string) => boolean | Promise<boolean>;
  onSelectTeacher: (teacher: Teacher) => void;
  initialPrompt?: string;
}

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  teachers,
  userPoints,
  onDeductPoints,
  onSelectTeacher,
  initialPrompt,
}) => {
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'msg_welcome',
      sender: 'assistant',
      content: '你好！我是交大教师评价助手。基于全校真实评价数据库，你可以问我任何选课、老师点名情况、给分风格等问题（例如：“哪位高数老师不点名还给高分？”、“土木力学课推荐谁？”）。\n每次智能问答消耗 2 积分。',
      timestamp: '刚刚',
    }
  ]);
  const [inputValue, setInputValue] = useState(initialPrompt || '');
  const [isLoading, setIsLoading] = useState(false);
  const [retrievedTeachers, setRetrievedTeachers] = useState<Teacher[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPrompt && isOpen) {
      setInputValue(initialPrompt);
    }
  }, [initialPrompt, isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const quickPrompts = [
    '推荐给分大方、很少点名的通识课老师',
    '计算机学院哪位老师讲数据结构最通透？',
    '高等数学想考90分以上保研选谁？',
    '土木力学想考研选陈宇宏老师合适吗？'
  ];

  // Simulated RAG Answer Generator using real local Teacher records
  const generateRAGResponse = (query: string, teachers: Teacher[]): { content: string; citedTeachers?: any[] } => {
    const q = query.toLowerCase();
    const missingRatingResponse = (teacher?: Teacher) => {
      if (!teacher) return { content: '暂无数据，目前没有找到可展示评分的教师。', citedTeachers: [] };
      if (isRating(teacher.overallScore) && RATING_DIMENSIONS.every(d => isRating(teacher.dimensions[d.key]))) return null;
      return {
        content: `**${teacher.name}** 的评分资料尚不完整：\n\n综合评分：${formatRating(teacher.overallScore, ' 分')}\n${RATING_DIMENSIONS.map(d => `${d.label}：${formatRating(teacher.dimensions[d.key], ' 分')}`).join('\n')}\n\n缺失维度显示“暂无数据”，暂不能据此判断教学表现。`,
        citedTeachers: [{id:teacher.id,name:teacher.name,course:teacher.courses[0],reason:'查看已有评分与缺失维度'}],
      };
    };

    // Query analysis
    if (q.includes('不点名') || q.includes('很少点名') || q.includes('签到')) {
      const laxTeachers = teachers
        .filter((t) => isRating(t.dimensions.attendanceStrictness) && t.dimensions.attendanceStrictness >= 3.8)
        .sort((a, b) => compareRatings(a.dimensions.attendanceStrictness, b.dimensions.attendanceStrictness));

      const topT = laxTeachers.slice(0, 3);
      if (!topT.length) return { content: '暂无数据，目前没有符合条件的考勤宽松度评分。', citedTeachers: [] };
      return {
        content: `以下教师的考勤宽松度评分 ≥ 3.8 分：\n\n${topT.map((t,i)=>`${i+1}. **${t.name}**（${t.college}）：考勤宽松度 ${formatRating(t.dimensions.attendanceStrictness,' 分')}，给分宽松度 ${formatRating(t.dimensions.gradingLeniency,' 分')}`).join('\n')}`,
        citedTeachers: topT.map((t) => ({
          id: t.id,
          name: t.name,
          course: t.courses[0],
          reason: `考勤宽松度 ${formatRating(t.dimensions.attendanceStrictness, ' 分')} · 给分宽松度 ${formatRating(t.dimensions.gradingLeniency, ' 分')}`
        }))
      };
    }

    if (q.includes('高数') || q.includes('微积分') || q.includes('数学')) {
      const mathTeachers = teachers.filter((t) => 
        t.college.includes('数学') || t.courses.some(c => c.includes('数学') || c.includes('微积分'))
      );
      const topMath = mathTeachers[0] || teachers[1];
      const incomplete = missingRatingResponse(topMath);
      if (incomplete) return incomplete;
      return {
        content: `针对【高等数学/微积分】，根据评价数据库分析推荐 **${topMath.name}**（${topMath.title}）：\n\n- **教学质量**：${formatRating(topMath.dimensions.teachingQuality, ' / 5.0')}（极高），学生公认黑板板书极强，逻辑推导清晰，非常适合想要扎实掌握定理、冲刺高分保研的同学。\n- **考核风格**：考勤宽松度为 ${formatRating(topMath.dimensions.attendanceStrictness, ' 分')}，但“努力回报”高达 ${formatRating(topMath.dimensions.effortMatters, ' 分')}，只要平时作业认真上交，期末绝不为难，平时分给得很足。\n- **本学期开课班级**：${topMath.recentTermCourses?.[0] || '高等数学(I)'}`,
        citedTeachers: [{
          id: topMath.id,
          name: topMath.name,
          course: topMath.courses[0],
          reason: `板书一流 · 综合评分 ${formatRating(topMath.overallScore)} · 评价 ${topMath.reviewCount} 条`
        }]
      };
    }

    if (q.includes('计算机') || q.includes('数据结构') || q.includes('算法')) {
      const csTeacher = teachers.find(t => t.college.includes('计算机')) || teachers[0];
      const incomplete = missingRatingResponse(csTeacher);
      if (incomplete) return incomplete;
      return {
        content: `在计算机专业课方面，**${csTeacher.name}** 教授在数据库中处于前列：\n\n- **特点**：给分大方（${formatRating(csTeacher.dimensions.gradingLeniency, '分')}）、考勤宽松度 ${formatRating(csTeacher.dimensions.attendanceStrictness, ' 分')}，亲和力满分（${formatRating(csTeacher.dimensions.approachability, '分')}）。\n- **考核建议**：老师注重编程实践能力，代码大作业如果能够独立手写并写出思路分析，通常都能拿到满绩点评价。\n- 本学期在犀浦校区主讲《${csTeacher.recentTermCourses?.[0] || '数据结构与算法'}》。`,
        citedTeachers: [{
          id: csTeacher.id,
          name: csTeacher.name,
          course: csTeacher.courses[0],
          reason: '极具亲和力 · 代码作业给分大方 · 从不点名'
        }]
      };
    }

    if (q.includes('土木') || q.includes('力学') || q.includes('陈宇宏')) {
      const civilTeacher = teachers.find(t => t.college.includes('土木')) || teachers[3];
      const incomplete = missingRatingResponse(civilTeacher);
      if (incomplete) return incomplete;
      return {
        content: `关于土木力学与 **${civilTeacher.name}** 老师：\n\n- **风格定位**：陈老师属于标准的“治学严谨型”名师。考勤宽松度 ${formatRating(civilTeacher.dimensions.attendanceStrictness, ' 分')}，给分宽松度仅 ${formatRating(civilTeacher.dimensions.gradingLeniency, ' 分')}，不容许任何学术划水。\n- **考研适配**：由于课程质量高达 ${formatRating(civilTeacher.dimensions.teachingQuality, ' 分')}，且“努力回报”达到满分 5.0，想要考研深造土木力学的同学选他的课基础会极其过硬！如果是想轻松混学分的，慎选。`,
        citedTeachers: [{
          id: civilTeacher.id,
          name: civilTeacher.name,
          course: civilTeacher.courses[0],
          reason: '考研名师 · 严格负责 · 理论功底扎实'
        }]
      };
    }

    // Default intelligent response matching general teachers
    const bestOverall = teachers.filter(t => isRating(t.overallScore)).sort((a, b) => compareRatings(a.overallScore, b.overallScore)).slice(0, 2);
    if (!bestOverall.length) return { content: '综合评分暂无数据，暂不能按评分推荐教师。', citedTeachers: [] };
    return {
      content: `按已有综合评分排序：\n\n${bestOverall.map((t,i)=>`${i+1}. **${t.name}**（${t.college}）：综合 ${formatRating(t.overallScore,' 分')}，开课科目：${t.courses.join('、') || '暂无数据'}。`).join('\n')}\n\n你可以继续查看教师详情中的各维度评分。`,
      citedTeachers: bestOverall.map((t) => ({
        id: t.id,
        name: t.name,
        course: t.courses[0],
        reason: `综合评分 ${formatRating(t.overallScore)} · ${t.tags[0]}`
      }))
    };
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isLoading) return;

    // Check points (AI 问答消耗 2 积分)
    if (userPoints < 2) {
      alert('您的积分不足！提问需要消耗 2 积分。可通过每日签到(+5分)或提交教师评价(+20分)快速获取积分。');
      return;
    }

    setIsLoading(true);
    let candidates = teachers;
    try {
      if (isSupabaseConfigured) {
        const keyword = /微积分/.test(text) ? '微积分' : /高数|数学/.test(text) ? '数学'
          : /计算机|数据结构|算法/.test(text) ? '数据结构' : /土木|力学/.test(text) ? '力学' : '';
        const result = await supabaseService.getTeachersPage({ query: keyword,
          sortBy: /点名|签到/.test(text) ? 'attendance' : 'overall', pageSize: 20 });
        candidates = result.items;
        setRetrievedTeachers(previous => Array.from(new Map([...previous, ...candidates].map(t => [t.id, t])).values()));
      }
      const deducted = await onDeductPoints(2, `AI 智能问答提问：“${text.slice(0, 15)}...”`);
      if (!deducted) { setIsLoading(false); return; }
    } catch {
      setMessages(previous => [...previous, { id: `error_${Date.now()}`, sender: 'assistant',
        content: '教师数据读取失败，请稍后重试。', timestamp: '刚刚' }]);
      setIsLoading(false);
      return;
    }

    const userMsg: AiChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      content: text,
      timestamp: '刚刚'
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    const responseData = generateRAGResponse(text, candidates);
    const assistantMsg: AiChatMessage = {
      id: `ai_${Date.now()}`,
      sender: 'assistant',
      content: responseData.content,
      timestamp: '刚刚',
      citedTeachers: responseData.citedTeachers
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setIsLoading(false);
  };

  return (
    <ModalFrame id="ai-assistant-modal" label="智能助手" onClose={onClose}>
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-xs"
      />

      <motion.div 
        id="ai-assistant-content" 
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.96 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="modal-panel relative z-10 bg-white w-full max-w-xl h-[88vh] h-[88dvh] sm:h-[80vh] max-h-[88vh] max-h-[88dvh] sm:max-h-[80vh] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/70 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 text-base">交大教师评价 AI Agent</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                  RAG 检索库
                </span>
              </div>
              <p className="text-xs text-gray-500">基于西南交大历史与最新学生实测数据回答</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs px-2.5 py-1 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 font-medium">
              <Coins className="w-3.5 h-3.5 text-amber-500" />
              <span>{userPoints} 积分</span>
            </div>
            <motion.button 
              id="close-ai-assistant-btn"
              whileTap={{ scale: 0.88 }}
              onClick={onClose}
            data-modal-close aria-label="关闭窗口"
              className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 text-xs shadow-xs">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              
              <div className={`max-w-[85%] space-y-2.5 ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-xs p-3.5 text-sm shadow-xs'
                  : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-2xl rounded-tl-xs p-4 text-sm shadow-2xs'
              }`}>
                <div className="leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>

                {/* Cited teacher cards */}
                {msg.citedTeachers && msg.citedTeachers.length > 0 && (
                  <div className="pt-2 border-t border-gray-200/60 space-y-1.5">
                    <span className="text-[11px] font-semibold text-gray-500 block">
                      引用数据源教师：
                    </span>
                    <div className="space-y-1.5">
                      {msg.citedTeachers.map((ct) => {
                        const actualTeacher = retrievedTeachers.find(t => t.id === ct.id) || teachers.find(t => t.id === ct.id);
                        return (
                          <motion.div
                            key={ct.id}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              if (actualTeacher) {
                                onSelectTeacher(actualTeacher);
                                onClose();
                              }
                            }}
                            className="p-2 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 transition-colors flex items-center justify-between cursor-pointer group text-xs text-gray-700"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900 group-hover:text-indigo-600">
                                {ct.name}
                              </span>
                              <span className="text-gray-400">·</span>
                              <span className="text-gray-500">{ct.course}</span>
                              <span className="text-gray-400">·</span>
                              <span className="text-gray-500 text-[11px]">{ct.reason}</span>
                            </div>
                            <span className="text-indigo-600 font-medium text-[11px] flex items-center gap-0.5">
                              看评价 <CornerDownRight className="w-3 h-3" />
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-gray-200 text-gray-700 flex items-center justify-center shrink-0 text-xs">
                  <User className="w-4 h-4" />
                </div>
              )}
            </motion.div>
          ))}

          {isLoading && (
            <motion.div 
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3 justify-start"
            >
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 text-xs animate-pulse">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-xs p-3.5 text-xs text-gray-500 flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-spin text-indigo-500" />
                <span>正在检索教师评价库并生成回答...</span>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick prompt suggestions */}
        <div className="px-4 py-2 bg-gray-50/80 border-t border-gray-100 overflow-x-auto scrollbar-none flex gap-2">
          {quickPrompts.map((prompt, idx) => (
            <motion.button
              key={idx}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSend(prompt)}
              className="text-xs whitespace-nowrap px-3 py-1 bg-white border border-gray-200 hover:border-indigo-300 hover:text-indigo-600 rounded-full text-gray-600 transition-colors shadow-2xs"
            >
              {prompt}
            </motion.button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="shrink-0 p-3 pb-7 sm:pb-3 border-t border-gray-100 bg-white flex items-center gap-2">
          <input
            id="ai-assistant-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            placeholder="问问哪个老师不点名、给分好，或搜专业课老师..."
            className="flex-1 px-4 py-2.5 bg-gray-50 rounded-2xl border border-gray-200 text-sm focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
          />
          <motion.button
            id="ai-assistant-send-btn"
            whileTap={{ scale: 0.94 }}
            disabled={!inputValue.trim() || isLoading}
            onClick={() => handleSend()}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl font-semibold text-sm flex items-center gap-1.5 transition-all shadow-md shadow-indigo-100"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">发送</span>
          </motion.button>
        </div>
      </motion.div>
    </ModalFrame>
  );
};
